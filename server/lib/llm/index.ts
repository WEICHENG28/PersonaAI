// 所有 LLM 呼叫都必須經過這裡（docs/07 第 6 節、07B 的 B0）：統一重試、逾時、JSON 驗證。
// 不要在其他地方 new OpenAI。
import type { z } from 'zod'
import type { ModelRole } from '../../../shared/types.js'
import { CONFIG } from '../config.js'
import { getLlmClient, normalizeChatResult, type ChatMessage } from './client.js'
import { withLlmMetric, classifyFailure, type LlmMetric, type LlmMetricState } from './metrics.js'
import { llmEnv, modelFor, modelParamsFor } from './env.js'
import { extractJson } from './json.js'

export { extractJson } from './json.js'
export { setLlmClient, normalizeChatResult, type LlmClient, type LlmChatResult, type LlmEmbedResult } from './client.js'
export { setLlmMetricSink, type LlmMetric } from './metrics.js'

export type LlmMessage = { role: 'user' | 'assistant'; content: string }

export interface LlmTextOptions {
  role: ModelRole
  system: string
  messages: LlmMessage[]
  lane?: 'fg' | 'bg'
  maxTokens?: number
  timeoutMs?: number
  maxAttempts?: number
  temperature?: number
  tag?: string
  onMetric?: (metric: LlmMetric) => void
}

export interface LlmJsonOptions<T> extends LlmTextOptions {
  schema: z.ZodType<T>
}

export class LlmError extends Error {
  constructor(
    readonly role: ModelRole | 'embed',
    readonly reason: string,
    readonly attempts: number,
  ) {
    super(`LLM 呼叫失敗（${role}，${attempts} 次）：${reason}`)
    this.name = 'LlmError'
  }
}

const MAX_ATTEMPTS = CONFIG.LLM_MAX_RETRIES + 1

/**
 * 模型平台同時收到太多請求會回 Connection error（評審一次就要 6 個），所以：
 * - 同時最多 MAX_CONCURRENT 個請求，其他排隊；
 * - 呼叫失敗後等一下再重試（第 n 次等 n × backoffMs）。測試時不等待。
 */
export const llmTuning = { maxConcurrent: 3, maxBackground: 1, backoffMs: process.env.VITEST ? 0 : 800 }

let running = 0
let background = 0
type Lane = 'fg' | 'bg'
const waiting: Record<Lane, (() => void)[]> = { fg: [], bg: [] }

/** 在唤醒等待者前预留名额，避免新请求抢走刚释放的空位。 */
function drain(): void {
  while (running < llmTuning.maxConcurrent) {
    const lane: Lane = waiting.fg.length ? 'fg' : 'bg'
    if (lane === 'bg' && background >= llmTuning.maxBackground) break
    const next = waiting[lane].shift()
    if (!next) break
    running++
    if (lane === 'bg') background++
    next()
  }
}

async function limited<T>(run: () => Promise<T>, metric: LlmMetricState, lane: Lane = 'fg'): Promise<T> {
  if (running < llmTuning.maxConcurrent && !waiting.fg.length && !waiting.bg.length
      && (lane === 'fg' || background < llmTuning.maxBackground)) {
    running++
    if (lane === 'bg') background++
  } else {
    const queued = performance.now()
    await new Promise<void>(resolve => { waiting[lane].push(resolve); drain() })
    metric.queueMs += performance.now() - queued
  }
  try {
    return await run()
  } finally {
    running--
    if (lane === 'bg') background--
    drain()
  }
}

function backoff(attempt: number, maxAttempts = MAX_ATTEMPTS): Promise<void> {
  return attempt < maxAttempts && llmTuning.backoffMs > 0
    ? new Promise((r) => setTimeout(r, attempt * llmTuning.backoffMs))
    : Promise.resolve()
}

export async function llmText(opts: LlmTextOptions): Promise<string> {
  return withLlmMetric({ ...opts, tag: opts.tag ?? 'llm.text' }, async metric => {
    const model = metric.model = modelFor(opts.role)
    let reason = ''
    const maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      metric.attempts = attempt
      try {
        const out = await chat(model, opts, opts.messages, false, metric)
        if (out.trim()) return out
        reason = '模型回傳空字串'
        metric.error = 'empty'
      } catch (err) {
        reason = describe(err)
        metric.error = classifyFailure(err)
        await backoff(attempt, maxAttempts)
      }
    }
    throw new LlmError(opts.role, reason, maxAttempts)
  })
}

export async function llmJson<T>(opts: LlmJsonOptions<T>): Promise<T> {
  return withLlmMetric({ ...opts, tag: opts.tag ?? 'llm.json' }, async metric => {
    const model = metric.model = modelFor(opts.role)
    let messages = opts.messages
    let reason = ''
    const maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      metric.attempts = attempt
      let raw: string
      try {
        raw = await chat(model, opts, messages, true, metric)
      } catch (err) {
        reason = describe(err)
        metric.error = classifyFailure(err)
        await backoff(attempt, maxAttempts)
        continue
      }
      const parsed = parseWith(raw, opts.schema)
      if (parsed.ok) return parsed.data
      reason = parsed.reason
      metric.error = raw.trim() ? 'schema' : 'empty'
      messages = buildJsonRetryMessages(opts.messages, raw, reason)
    }
    throw new LlmError(opts.role, reason, maxAttempts)
  })
}

export async function embed(text: string): Promise<number[]> {
  return withLlmMetric({ role: 'embed', tag: 'llm.embed' }, async metric => {
    const env = llmEnv()
    metric.model = env.MODEL_EMBED
    let reason = ''
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      metric.attempts = attempt
      try {
        const result = await limited(() => getLlmClient().embed({ model: env.MODEL_EMBED, input: text, dimensions: env.EMBEDDING_DIM }), metric)
        const { vector: vec, usage } = Array.isArray(result) ? { vector: result } : result
        if (usage?.promptTokens != null) metric.promptTokens = (metric.promptTokens ?? 0) + usage.promptTokens
        if (vec.length === env.EMBEDDING_DIM) return vec
        metric.error = 'dimension'
        // 長度不符是設定錯誤，重試也不會好
        throw new LlmError('embed', `向量長度 ${vec.length}，預期 ${env.EMBEDDING_DIM}`, attempt)
      } catch (err) {
        if (err instanceof LlmError) throw err
        reason = describe(err)
        metric.error = classifyFailure(err)
        await backoff(attempt)
      }
    }
    throw new LlmError('embed', reason, MAX_ATTEMPTS)
  })
}

async function chat(model: string, opts: LlmTextOptions, messages: LlmMessage[], jsonMode: boolean, metric: LlmMetricState): Promise<string> {
  const all: ChatMessage[] = [{ role: 'system', content: opts.system }, ...messages]
  const result = normalizeChatResult(await limited(
    () => getLlmClient().chat({ model, messages: all, temperature: opts.temperature, jsonMode,
      maxTokens: opts.maxTokens ?? CONFIG.LLM_MAX_TOKENS[opts.role],
      timeoutMs: opts.timeoutMs ?? CONFIG.LLM_FG_TIMEOUT_MS, extraBody: modelParamsFor(model) }), metric, opts.lane,
  ))
  if (result.usage?.promptTokens != null) metric.promptTokens = (metric.promptTokens ?? 0) + result.usage.promptTokens
  if (result.usage?.completionTokens != null) metric.completionTokens = (metric.completionTokens ?? 0) + result.usage.completionTokens
  return result.content
}

function parseWith<T>(raw: string, schema: z.ZodType<T>): { ok: true; data: T } | { ok: false; reason: string } {
  const json = extractJson(raw)
  if (!json) return { ok: false, reason: '找不到 JSON' }
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch (err) {
    return { ok: false, reason: `JSON 解析失敗：${describe(err)}` }
  }
  const result = schema.safeParse(value)
  if (result.success) return { ok: true, data: result.data }
  const issues = result.error.issues.map((i) => `${i.path.join('.') || '(根)'}：${i.message}`).join('；')
  return { ok: false, reason: `欄位不符：${issues}` }
}

function describe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err)
}

/** 单次逻辑调用的执行预算，不包含排队和业务 DB 时间。 */
export function worstCaseMs({ timeoutMs, maxAttempts, backoffMs }: {
  timeoutMs: number; maxAttempts: number; backoffMs: number
}): number {
  return timeoutMs * maxAttempts + maxAttempts * (maxAttempts - 1) / 2 * backoffMs
}

/** 每次重试都从原始消息重建，避免历史错误回复不断累积。 */
export function buildJsonRetryMessages(original: LlmMessage[], raw: string, reason: string): LlmMessage[] {
  return [
    ...original,
    { role: 'assistant', content: raw.length > 400 ? raw.slice(0, 400) + '…' : raw },
    { role: 'user', content: `上次输出格式错误：${reason}，请只输出符合格式的 JSON` },
  ]
}
