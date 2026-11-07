export type ProbeVariant = 'default' | 'qwen_no_think' | 'glm_no_think'

export const THINKING_VARIANTS: Record<ProbeVariant, Record<string, unknown>> = {
  default: {},
  qwen_no_think: { enable_thinking: false },
  glm_no_think: { thinking: { type: 'disabled' } },
}

export interface ProbeResult {
  model: string
  mode: 'nonstream' | 'stream' | 'embed'
  variant: ProbeVariant
  ok: boolean
  ttftMs: number | null
  totalMs: number
  completionTokens: number | null
  reasoningChars: number
  jsonObject: 'ok' | 'rejected' | 'invalid' | 'skipped'
  embedDim?: number
  error?: string
}

export function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null
  const sorted = [...xs].sort((a, b) => a - b)
  const index = (sorted.length - 1) * p / 100
  const lo = Math.floor(index)
  const a = sorted[lo]!
  return a + ((sorted[lo + 1] ?? a) - a) * (index - lo)
}

export function redactError(msg: string, secrets: string[]): string {
  const needles = secrets.filter(Boolean).flatMap(s => [s, encodeURIComponent(s)])
    .sort((a, b) => b.length - a.length)
  let safe = msg
  for (const secret of needles) safe = safe.split(secret).join('[REDACTED]')
  return safe.replace(/https?:\/\/[^\s<>"'`]+/gi, '[URL]')
    .replace(/\bsk-[\w-]+/gi, '[REDACTED]')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
}

const cell = (s: string): string => redactError(s, []).replace(/[\r\n|]/g, ' ')
const number = (n: number | null): string => n === null ? '—' : String(Math.round(n * 10) / 10)

function summarizeGroup(rows: ProbeResult[]): string {
  const first = rows[0]!
  const ok = rows.filter(r => r.ok)
  // JSON 能力检查是独立请求，不混入普通文本的延迟基准。
  const timed = ok.filter(r => r.jsonObject === 'skipped')
  const json = ['ok', 'rejected', 'invalid', 'skipped'].map(
    status => `${status}:${rows.filter(r => r.jsonObject === status).length}`,
  ).join(', ')
  const dims = [...new Set(rows.flatMap(r => r.embedDim === undefined ? [] : [r.embedDim]))].join(', ') || '—'
  return `| ${cell(first.model)} | ${first.mode} | ${first.variant} | ` +
    `${number(percentile(timed.flatMap(r => r.ttftMs === null ? [] : [r.ttftMs]), 50))} | ` +
    `${number(percentile(timed.map(r => r.totalMs), 50))} | ${ok.length}/${rows.length} ` +
    `(${(100 * ok.length / rows.length).toFixed(1)}%) | ${json} | ` +
    `${number(percentile(ok.map(r => r.reasoningChars), 50))} | ` +
    `${number(percentile(ok.flatMap(r => r.completionTokens === null ? [] : [r.completionTokens]), 50))} | ${dims} |`
}

export function summarizeProbe(results: ProbeResult[]): string {
  const groups = new Map<string, ProbeResult[]>()
  for (const row of results) {
    const key = JSON.stringify([row.model, row.mode, row.variant])
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  const failed = results.filter(r => !r.ok).length
  const errorRate = results.length ? (100 * failed / results.length).toFixed(1) : '0.0'
  const errors = results.filter(r => r.error).map(
    r => `- ${cell(r.model)} / ${r.mode} / ${r.variant}: ${cell(r.error!)}`,
  )
  return [
    '# LLM 平台探测报告', '',
    `请求数：${results.length}；失败：${failed}；错误率：${errorRate}%（含 JSON 格式验证失败）。`,
    '延迟仅统计成功的普通文本/embedding 请求；JSON 能力检查独立执行，不计入延迟。',
    'TTFT 为第一个非空正文 delta（不含 reasoning）；无正文或无 usage 时记为 —。',
    'reasoning 字数和 completion tokens 均为成功请求的 p50；不保存模型输出。', '',
    '| 模型 | 模式 | 变体 | p50 TTFT (ms) | p50 总时间 (ms) | 成功率 | json_object | p50 reasoning 字数 | p50 completion tokens | embedding 维度 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...[...groups.values()].map(summarizeGroup), '',
    ...(errors.length ? ['## 已脱敏错误', '', ...errors, ''] : []),
  ].join('\n')
}
