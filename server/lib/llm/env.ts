// LLM 相關環境變數。A0b 建好 server/lib/env.ts 後可以改成從那裡讀。
import { z } from 'zod'
import type { ModelRole } from '../../../shared/types.js'

const schema = z.object({
  LLM_BASE_URL: z.string().url(),
  LLM_API_KEY: z.string().min(1),
  MODEL_CHAT: z.string().min(1),
  MODEL_REASON: z.string().min(1),
  MODEL_FAST: z.string().min(1),
  MODEL_EMBED: z.string().min(1),
  EMBEDDING_DIM: z.coerce.number().int().positive(),
})

export type LlmEnv = z.infer<typeof schema>

let cached: LlmEnv | null = null

/** 第一次呼叫 LLM 時才檢查，缺值就丟出說明缺哪幾個的錯誤。 */
export function llmEnv(): LlmEnv {
  if (cached) return cached
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join('、')
    throw new Error(`缺少或無效的 LLM 環境變數：${missing}（見 .env.example）`)
  }
  cached = parsed.data
  return cached
}

export function modelFor(role: ModelRole): string {
  const env = llmEnv()
  return { chat: env.MODEL_CHAT, reason: env.MODEL_REASON, fast: env.MODEL_FAST }[role]
}

/** 精确名称优先，其次采用最长的前缀；空配置保持原有请求参数。 */
export function modelParamsFor(model: string): Record<string, unknown> {
  const raw = process.env.LLM_MODEL_PARAMS
  if (!raw) return {}
  try {
    const params: unknown = JSON.parse(raw)
    const object = (value: unknown): value is Record<string, unknown> =>
      value !== null && typeof value === 'object' && !Array.isArray(value)
    if (!object(params) || !Object.values(params).every(object)) throw new Error()
    if (Object.hasOwn(params, model)) return params[model] as Record<string, unknown>
    const key = Object.keys(params).filter(k => k.endsWith('*') && model.startsWith(k.slice(0, -1)))
      .sort((a, b) => b.length - a.length)[0]
    return key ? params[key] as Record<string, unknown> : {}
  } catch {
    throw new Error('LLM_MODEL_PARAMS 不是有效的 JSON 对象')
  }
}
