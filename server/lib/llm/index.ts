// 所有 LLM 呼叫都必須經過這裡（docs/07 第 6 節、07B 的 B0）：統一重試、逾時、JSON 驗證。
// 不要在其他地方 new OpenAI。
import type { z } from 'zod'
import type { ModelRole } from '../../../shared/types'
import { CONFIG } from '../config'
import { getLlmClient, type ChatMessage } from './client'
import { llmEnv, modelFor } from './env'
import { extractJson } from './json'

export { extractJson } from './json'
export { setLlmClient, type LlmClient } from './client'

export type LlmMessage = { role: 'user' | 'assistant'; content: string }

export interface LlmTextOptions {
  role: ModelRole
  system: string
  messages: LlmMessage[]
  temperature?: number
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

export async function llmText(opts: LlmTextOptions): Promise<string> {
  const model = modelFor(opts.role)
  let reason = ''
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const out = await chat(model, opts, opts.messages, false)
      if (out.trim()) return out
      reason = '模型回傳空字串'
    } catch (err) {
      reason = describe(err)
    }
  }
  throw new LlmError(opts.role, reason, MAX_ATTEMPTS)
}

export async function llmJson<T>(opts: LlmJsonOptions<T>): Promise<T> {
  const model = modelFor(opts.role)
  let messages = opts.messages
  let reason = ''
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let raw: string
    try {
      raw = await chat(model, opts, messages, true)
    } catch (err) {
      reason = describe(err)
      continue
    }
    const parsed = parseWith(raw, opts.schema)
    if (parsed.ok) return parsed.data
    reason = parsed.reason
    messages = [
      ...opts.messages,
      { role: 'assistant', content: raw },
      { role: 'user', content: `上次输出格式错误：${reason}，请只输出符合格式的 JSON` },
    ]
  }
  throw new LlmError(opts.role, reason, MAX_ATTEMPTS)
}

export async function embed(text: string): Promise<number[]> {
  const env = llmEnv()
  let reason = ''
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const vec = await getLlmClient().embed({ model: env.MODEL_EMBED, input: text, dimensions: env.EMBEDDING_DIM })
      if (vec.length === env.EMBEDDING_DIM) return vec
      // 長度不符是設定錯誤，重試也不會好
      throw new LlmError('embed', `向量長度 ${vec.length}，預期 ${env.EMBEDDING_DIM}`, attempt)
    } catch (err) {
      if (err instanceof LlmError) throw err
      reason = describe(err)
    }
  }
  throw new LlmError('embed', reason, MAX_ATTEMPTS)
}

function chat(model: string, opts: LlmTextOptions, messages: LlmMessage[], jsonMode: boolean): Promise<string> {
  const all: ChatMessage[] = [{ role: 'system', content: opts.system }, ...messages]
  return getLlmClient().chat({ model, messages: all, temperature: opts.temperature, jsonMode })
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
