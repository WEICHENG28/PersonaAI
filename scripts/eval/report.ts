// E-3 評測報告（純函式，不打模型、不讀環境變數）：彙整結果、產生盲測對照表、CSV 跳脫。
import { NATURALNESS_KEYS, type NaturalnessScore } from './judge.js'
import { COPY_THRESHOLD } from './metrics.js'

export type EvalSuite = 'memory' | 'profile' | 'friend' | 'twin'

export interface EvalRow {
  suite: EvalSuite
  scenarioId: string
  repeat: number
  /** 分身題組：第幾則（從 0 起）；其他題組沒有。 */
  turn?: number
  model: string
  /** 模型的輸出（記憶、檔案是 JSON 文字；阿澈、分身是那一則話）。 */
  output: string
  /** 給盲測看的上下文（最近對話＋用戶這句）。 */
  context?: string
  /** 有明確對錯的題（記憶、檔案、找人意圖）才有；其他是 null。 */
  pass: boolean | null
  /** 沒通過的原因（給人看）。 */
  failReason?: string
  scores?: NaturalnessScore
  endsWithQuestion?: boolean
  copySim?: number
  ttftMs: number | null
  totalMs: number
  completionTokens: number | null
  llmCalls: number
  error?: string
}

export function percentile(xs: readonly number[], p: number): number | null {
  if (!xs.length) return null
  const sorted = [...xs].sort((a, b) => a - b)
  const index = ((sorted.length - 1) * p) / 100
  const lo = Math.floor(index)
  const a = sorted[lo]!
  return a + ((sorted[lo + 1] ?? a) - a) * (index - lo)
}

const fmt = (n: number | null, digits = 0) => (n === null || Number.isNaN(n) ? '—' : n.toFixed(digits))
const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`)
const avg = (xs: readonly number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)

/** 一個題組的數字（summarize 和測試都用）。 */
export function suiteStats(rows: readonly EvalRow[]) {
  const judged = rows.filter(r => r.pass !== null)
  const scored = rows.filter(r => r.scores)
  const questioned = rows.filter(r => r.endsWithQuestion !== undefined)
  const copied = rows.filter(r => r.copySim !== undefined)
  const ok = rows.filter(r => !r.error)
  return {
    count: rows.length,
    errors: rows.length - ok.length,
    passRate: judged.length ? judged.filter(r => r.pass).length / judged.length : null,
    scores: Object.fromEntries(NATURALNESS_KEYS.map(k => [k, avg(scored.map(r => r.scores![k]))])) as Record<(typeof NATURALNESS_KEYS)[number], number | null>,
    scoreAvg: avg(scored.map(r => avg(NATURALNESS_KEYS.map(k => r.scores![k]))!)),
    questionRatio: questioned.length ? questioned.filter(r => r.endsWithQuestion).length / questioned.length : null,
    copyRatio: copied.length ? copied.filter(r => r.copySim! >= COPY_THRESHOLD).length / copied.length : null,
    p50TotalMs: percentile(ok.map(r => r.totalMs), 50),
    p95TotalMs: percentile(ok.map(r => r.totalMs), 95),
    p50TtftMs: percentile(ok.flatMap(r => (r.ttftMs === null ? [] : [r.ttftMs])), 50),
    avgCompletionTokens: avg(ok.flatMap(r => (r.completionTokens === null ? [] : [r.completionTokens]))),
    avgLlmCalls: avg(ok.map(r => r.llmCalls)),
  }
}

/** Markdown 摘要：每個題組一列。 */
export function summarize(rows: readonly EvalRow[]): string {
  const suites = [...new Set(rows.map(r => r.suite))]
  const head = [
    '| 题组 | 数量 | 错误 | 通过率 | 评审平均 | catch | not_interview | no_copy | persona | length | 问号结尾 | 照抄 | p50 总时间 ms | p95 总时间 ms | p50 首字 ms | 平均 tokens | 平均 LLM 次数 |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ]
  const body = suites.map(suite => {
    const s = suiteStats(rows.filter(r => r.suite === suite))
    return `| ${suite} | ${s.count} | ${s.errors} | ${pct(s.passRate)} | ${fmt(s.scoreAvg, 2)} | ${NATURALNESS_KEYS.map(k => fmt(s.scores[k], 2)).join(' | ')} | ${pct(s.questionRatio)} | ${pct(s.copyRatio)} | ${fmt(s.p50TotalMs)} | ${fmt(s.p95TotalMs)} | ${fmt(s.p50TtftMs)} | ${fmt(s.avgCompletionTokens, 1)} | ${fmt(s.avgLlmCalls, 2)} |`
  })
  const failed = rows.filter(r => r.pass === false || r.error)
  const failLines = failed.map(r => `- ${r.suite}/${r.scenarioId}#${r.repeat}${r.turn !== undefined ? `/${r.turn}` : ''}：${r.error ?? r.failReason ?? '未通过'}`)
  return [...head, ...body, '', failed.length ? '### 没通过或出错的题' : '全部通过', ...failLines].join('\n')
}

/** CSV 欄位：有逗號、引號、換行就包引號，引號重複一次。 */
export function csvEscape(s: string): string {
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** 可重現的亂數（mulberry32）。 */
function seeded(seed: number) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let x = Math.imul(t ^ (t >>> 15), 1 | t)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

interface BlindItem {
  key: string
  scenario: string
  context: string
  output: string
}

/**
 * 可以拿來比的單位：阿澈題是一則回覆（同樣的上下文）；分身題是一整場對話
 * （第二則以後兩版的前文已經不同，逐則比不公平，所以整場一起比）。整場有任何一則出錯就不比。
 */
export function blindItems(rows: readonly EvalRow[]): BlindItem[] {
  const items: BlindItem[] = rows
    .filter(r => r.suite === 'friend' && !r.error)
    .map(r => ({ key: `friend|${r.scenarioId}|${r.repeat}`, scenario: r.scenarioId, context: r.context ?? '', output: r.output }))
  const twins = new Map<string, EvalRow[]>()
  for (const r of rows.filter(x => x.suite === 'twin')) {
    const k = `twin|${r.scenarioId}|${r.repeat}`
    twins.set(k, [...(twins.get(k) ?? []), r])
  }
  for (const [k, list] of twins) {
    if (list.some(r => r.error)) continue
    const sorted = [...list].sort((x, y) => (x.turn ?? 0) - (y.turn ?? 0))
    items.push({
      key: k,
      scenario: sorted[0]!.scenarioId,
      context: sorted[0]!.context ?? '',
      output: sorted.map(r => `${(r.turn ?? 0) % 2 === 0 ? '甲' : '乙'}：${r.output}`).join('\n'),
    })
  }
  return items
}

/**
 * 盲測對照：同一題同一次的兩版，隨機決定誰放 reply_1。
 * 同一個 seed 結果固定。key 記錄每一對的 reply_1 是 A 還是 B（標完再對答案）。
 */
export function toBlindPairs(a: readonly EvalRow[], b: readonly EvalRow[], seed: number): { csv: string; key: Record<string, 'A' | 'B'> } {
  const rand = seeded(seed)
  const bByKey = new Map(blindItems(b).map(i => [i.key, i]))
  const lines = ['pair_id,scenario_id,context,reply_1,reply_2,pick,notes']
  const key: Record<string, 'A' | 'B'> = {}
  let n = 0
  for (const ia of blindItems(a)) {
    const ib = bByKey.get(ia.key)
    if (!ib) continue
    const pairId = `p${String(++n).padStart(3, '0')}`
    const aFirst = rand() < 0.5
    key[pairId] = aFirst ? 'A' : 'B'
    const [r1, r2] = aFirst ? [ia.output, ib.output] : [ib.output, ia.output]
    lines.push([pairId, ia.scenario, ia.context, r1, r2, '', ''].map(csvEscape).join(','))
  }
  return { csv: lines.join('\n') + '\n', key }
}

/** config.json：只放模型名稱與參數，絕不放金鑰、網址。 */
export function buildConfig(input: { label: string; suites: string[]; repeat: number; models: Record<string, string>; startedAt: string; modelParamsSet?: boolean }) {
  // modelParamsSet：有沒有設 LLM_MODEL_PARAMS（例如關掉思考），只記有沒有、不記內容
  return { label: input.label, suites: input.suites, repeat: input.repeat, models: input.models, modelParamsSet: input.modelParamsSet ?? false, startedAt: input.startedAt }
}
