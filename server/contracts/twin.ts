// C 提供的跨線函式（docs/07 第 6 節）。目前是 stub：簽名正確、回傳 server/fixtures 假資料。
// 擁有者：C。簽名是共用約定，改前三人同意；內部實作 C 自由替換。
import type { ChatMessage, GuardResult, StartConversationInput } from '../../shared/types'
import { fakeTranscript } from '../fixtures/twin'

export async function startConversation(_input: StartConversationInput): Promise<{ conversationId: string }> {
  return { conversationId: 'conv-stub-1' }
}

export async function runTwinRounds(
  _conversationId: string,
  rounds: number,
): Promise<{ roundCount: number; ended: boolean }> {
  return { roundCount: rounds, ended: false }
}

export async function getTranscript(conversationId: string): Promise<ChatMessage[]> {
  return fakeTranscript.map((m) => ({ ...m, conversation_id: conversationId }))
}

export async function endConversation(
  _conversationId: string,
  _reason: 'unsuitable' | 'done' | 'declined',
): Promise<void> {}

export async function markWaitingHuman(_conversationId: string): Promise<void> {}

export async function guardText(text: string, _ownerUserId: string): Promise<GuardResult> {
  return { ok: true, text, issues: [] }
}
