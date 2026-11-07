import type { FriendChatResult, FriendMessage } from '../../lib/api/friend'
import { reconcileChatFailure } from './chatFailure'

export function applyChatResult(prev: FriendMessage[], tempId: string, result: FriendChatResult): FriendMessage[] | null {
  if (!result.messages) return null
  if (!result.messages.length) return prev
  const rows = new Map(prev.filter(row => row.id !== tempId).map(row => [row.id, row]))
  for (const row of result.messages) rows.set(row.id, row)
  return [...rows.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
}

/** 迟到初始化只补缺少的 id，现有行（含失败临时消息）优先，绝不覆盖新状态。 */
export function mergeInitializedHistory(prev: FriendMessage[], snapshot: FriendMessage[]): FriendMessage[] {
  const currentIds = new Set(prev.map(row => row.id))
  const rows = new Map([...snapshot.filter(row => !currentIds.has(row.id)), ...prev].map(row => [row.id, row]))
  return [...rows.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
}

interface SendDeps {
  readSendSeq(): number
  callFriendChat(text: string): Promise<FriendChatResult>
  getFriendMessages(): Promise<FriendMessage[]>
  setMessages(update: (prev: FriendMessage[]) => FriendMessage[]): void
  onConfirmed(): void
  onTask(taskId: string): void
  onError(error: unknown): void
  onSettled(): void
}
/** 每个异步边界与状态提交时都复查版本；旧 POST／GET 不能覆盖新的送出。 */
export async function sendChatTurn(text: string, tempId: string, seq: number, deps: SendDeps): Promise<void> {
  const current = () => deps.readSendSeq() === seq
  try {
    const result = await deps.callFriendChat(text)
    if (!current()) return
    if (result.messages) {
      deps.setMessages(prev => current() ? applyChatResult(prev, tempId, result) ?? prev : prev)
    } else {
      const rows = await deps.getFriendMessages()
      if (!current()) return
      deps.setMessages(prev => current() ? rows : prev)
    }
    if (!current()) return
    deps.onConfirmed()
    if (result.taskId) deps.onTask(result.taskId)
  } catch (error) {
    if (!current()) return
    deps.onError(error)
    let rows: FriendMessage[] | null = null
    try { rows = await deps.getFriendMessages() } catch { /* 保留未确认的原文 */ }
    if (!current()) return
    deps.setMessages(prev => current() ? reconcileChatFailure(prev, tempId, rows) : prev)
    if (rows !== null) deps.onConfirmed()
  } finally { if (current()) deps.onSettled() }
}
