// LLM 相關環境變數。A0b 建好 server/lib/env.ts 後可以改成從那裡讀。
import { z } from 'zod'
import type { ModelRole } from '../../../shared/types'

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
