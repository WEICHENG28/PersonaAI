import type { ChatMessage, GuardResult, StartConversationInput } from '@/lib/types'
import { chatMessages as messagesFixture } from '@/fixtures/twin'

/**
 * C 線跨線函式 stub（07 §6）。簽名正確；C1/C3/C2 完成時換成真實作。
 */

/** 建立對話；若 a 方是分身，先送出開場訊息。（B、C 使用） */
export async function startConversation(
  input: StartConversationInput
): Promise<{ conversationId: string }> {
  void input
  return { conversationId: '00000000-0000-4000-8000-0000000000c1' }
}

/** 雙方分身各說一次算一輪，跑指定輪數；達到 MAX_ROUNDS 時 ended = true。（B 使用） */
export async function runTwinRounds(
  conversationId: string,
  rounds: number
): Promise<{ roundCount: number; ended: boolean }> {
  void conversationId
  return { roundCount: rounds, ended: rounds >= 16 }
}

/** 依時間排序的完整對話。（B 使用） */
export async function getTranscript(conversationId: string): Promise<ChatMessage[]> {
  void conversationId
  return messagesFixture
}

/** 分身禮貌收尾並把對話設為 ended。（B 使用） */
export async function endConversation(
  conversationId: string,
  reason: 'unsuitable' | 'done' | 'declined'
): Promise<void> {
  void conversationId
  void reason
  throw new Error('endConversation 尚未實作（C 線交付）')
}

/** 判定合適後，對話改成 `waiting_human`，等本人接手。（B 使用） */
export async function markWaitingHuman(conversationId: string): Promise<void> {
  void conversationId
  throw new Error('markWaitingHuman 尚未實作（C 線交付）')
}

/** 隱私守門；B 顯示不合適原因前也要先過這一關。（B、C 使用） */
export async function guardText(text: string, ownerUserId: string): Promise<GuardResult> {
  void ownerUserId
  return { ok: true, text, issues: [] }
}
