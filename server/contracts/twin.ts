// C 提供的跨線函式（docs/07 第 6 節）。
// guardText 是 C2（server/twin/guard.ts）；代聊五個函式是 C3（server/twin/conversation.ts）。
// 沒設定 Supabase 時（B 的記憶體模式、測試）代聊函式改用記憶體版（server/twin/conversationStub.ts，回傳假資料）。
// 擁有者：C。簽名是共用約定，改前三人同意；內部實作 C 自由替換。
import type { ChatMessage, GuardResult, StartConversationInput } from '../../shared/types.js'
import { createConversationApi, defaultConversationDeps, type ConversationApi } from '../twin/conversation.js'
import { memoryConversationApi } from '../twin/conversationStub.js'
import { guardText as guardTextImpl } from '../twin/guard.js'

let realApi: ConversationApi | null = null

function conversationApi(): ConversationApi {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return memoryConversationApi
  realApi ??= createConversationApi(defaultConversationDeps())
  return realApi
}

/** 建立對話（b 方一律分身）；a 方是分身時先送出開場。 */
export async function startConversation(input: StartConversationInput): Promise<{ conversationId: string }> {
  return conversationApi().startConversation(input)
}

/** 雙方分身各說一次算一輪；達到 MAX_ROUNDS 或對話不是 active 時 ended = true。 */
export async function runTwinRounds(
  conversationId: string,
  rounds: number,
): Promise<{ roundCount: number; ended: boolean }> {
  return conversationApi().runTwinRounds(conversationId, rounds)
}

/** 依時間排序的完整對話。 */
export async function getTranscript(conversationId: string): Promise<ChatMessage[]> {
  return conversationApi().getTranscript(conversationId)
}

/** 分身禮貌收尾，並把對話設為 ended。 */
export async function endConversation(
  conversationId: string,
  reason: 'unsuitable' | 'done' | 'declined',
): Promise<void> {
  return conversationApi().endConversation(conversationId, reason)
}

/** 對話改成 waiting_human，分身不再自動發言。 */
export async function markWaitingHuman(conversationId: string): Promise<void> {
  return conversationApi().markWaitingHuman(conversationId)
}

/** 隱私守門（07C C2）：規則遮蔽個資＋Prompt 13 檢查；text 是可以送出的版本。 */
export async function guardText(text: string, ownerUserId: string): Promise<GuardResult> {
  return guardTextImpl(text, ownerUserId)
}
