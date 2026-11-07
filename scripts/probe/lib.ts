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
  finishReason: string | null
  responseReceived?: boolean
  jsonObject: 'ok' | 'rejected' | 'invalid' | 'skipped'
  requestKind?: 'text' | 'json_object' | 'embed'
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
  const isJson = (r: ProbeResult) => r.requestKind === 'json_object' ||
    (r.requestKind === undefined && r.jsonObject !== 'skipped')
  const checks = rows.filter(isJson)
  const samples = rows.filter(r => !isJson(r))
  const ok = samples.filter(r => r.ok)
  const responded = rows.filter(r => r.responseReceived ?? (r.ok || r.finishReason !== null ||
    r.reasoningChars > 0 || r.ttftMs !== null || r.completionTokens !== null))
  const json = ['ok', 'rejected', 'invalid', 'skipped'].map(
    status => `${status}:${checks.filter(r => r.jsonObject === status).length}`,
  ).join(', ')
  const success = samples.length ? `${ok.length}/${samples.length} (${(100 * ok.length / samples.length).toFixed(1)}%)` : '—'
  const dims = [...new Set(rows.flatMap(r => r.embedDim === undefined ? [] : [r.embedDim]))].join(', ') || '—'
  return `| ${cell(first.model)} | ${first.mode} | ${first.variant} | ` +
    `${number(percentile(ok.flatMap(r => r.ttftMs === null ? [] : [r.ttftMs]), 50))} | ` +
    `${number(percentile(ok.map(r => r.totalMs), 50))} | ${success} | ${json} | ` +
    `${number(percentile(responded.map(r => r.reasoningChars), 50))} | ` +
    `${number(percentile(ok.flatMap(r => r.completionTokens === null ? [] : [r.completionTokens]), 50))} | ${dims} | ` +
    `${rows.filter(r => r.finishReason === 'length').length} |`
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
    '表内成功率仅统计普通文本/embedding 请求；延迟、completion tokens 仅统计其中成功的请求。',
    'JSON 能力检查单独计数（skipped 为传输或其他 HTTP 失败），不混入普通文本成功率、延迟及 tokens；总错误率涵盖所有请求。',
    'TTFT 为第一个非空正文 delta（不含 reasoning）；无正文或无 usage 时记为 —。',
    'p50 reasoning 字数统计所有有响应的请求（含失败及 JSON 检查）；length 截断数统计该组所有请求。不保存模型输出。', '',
    '| 模型 | 模式 | 变体 | p50 TTFT (ms) | p50 总时间 (ms) | 成功率 | json_object | p50 reasoning 字数 | p50 completion tokens | embedding 维度 | length 截断数 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...[...groups.values()].map(summarizeGroup), '',
    ...(errors.length ? ['## 已脱敏错误', '', ...errors, ''] : []),
  ].join('\n')
}
