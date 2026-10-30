import { z } from 'zod'
import { CONFIG } from '@/lib/config'
import type { ModelRole } from '@/lib/types'

/**
 * B 線 LLM 封裝 stub（07 §6）。所有 LLM 呼叫都必須經過這裡（含重試、逾時、
 * JSON 驗證）。B0 交付實作；簽名已定稿。
 */

export interface LlmTextOptions {
  role: ModelRole
  system: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  temperature?: number
}

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly role: ModelRole,
    public readonly cause?: unknown
  ) {
    super(`[LLM:${role}] ${message}`)
    this.name = 'LlmError'
  }
}

/** 文字輸出。逾時或失敗自動重試 CONFIG.LLM_MAX_RETRIES 次。 */
export async function llmText(opts: LlmTextOptions): Promise<string> {
  void CONFIG.LLM_MAX_RETRIES
  throw new LlmError('llmText 尚未實作（B0 交付）', opts.role)
}

/** JSON 輸出，用 zod schema 驗證；不符時重試，全部失敗丟 LlmError。 */
export async function llmJson<T>(opts: {
  role: ModelRole
  system: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  schema: z.ZodType<T>
  temperature?: number
}): Promise<T> {
  void opts.schema
  throw new LlmError('llmJson 尚未實作（B0 交付）', opts.role)
}

/** 文字 → 向量（MODEL_EMBED）。 */
export async function embed(text: string): Promise<number[]> {
  void text
  throw new LlmError('embed 尚未實作（B0 交付）', 'fast')
}
