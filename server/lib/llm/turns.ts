// 多輪訊息（N-1）：把對話整理成模型要的 user／assistant 交替格式。
// 原本整段對話壓成一則 user 訊息，模型分不清誰說了什麼（容易複述、像在寫摘要）。
import type { LlmMessage } from './index.js'

export const DEFAULT_LEAD_IN = '（打开聊天）'

/**
 * 連續同一個角色的訊息用換行合併；第一則一定是 user（開頭是 assistant 時前面補 leadIn）。
 * 空白訊息略過。
 */
export function toAlternatingTurns(items: readonly LlmMessage[], opts: { leadIn?: string } = {}): LlmMessage[] {
  const out: LlmMessage[] = []
  for (const item of items) {
    const content = item.content.trim()
    if (!content) continue
    const last = out.at(-1)
    if (last && last.role === item.role) last.content = `${last.content}\n${content}`
    else out.push({ role: item.role, content })
  }
  if (out[0]?.role === 'assistant') out.unshift({ role: 'user', content: opts.leadIn ?? DEFAULT_LEAD_IN })
  return out
}
