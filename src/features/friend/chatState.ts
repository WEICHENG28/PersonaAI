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

/** 保留 PostgreSQL 的微秒；Date.parse 本身只保留毫秒，可能把較早卡片誤認為同時。 */
function messageTime(iso: string): bigint | null {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  const fraction = /\.(\d+)(?:Z|[+-]\d{2}:?\d{2})$/i.exec(iso)?.[1] ?? ''
  return BigInt(ms) * 1000n + BigInt(fraction.slice(3, 6).padEnd(3, '0'))
}

/** 使用阿澈回覆的伺服器時間，忽略先前任務；同一時間寫入的結果也可接收。 */
export function findTaskCardAfter(msgs: FriendMessage[], sinceIso: string): FriendMessage | null {
  const since = messageTime(sinceIso)
  if (since === null) return null
  return msgs.find(msg => {
    if (msg.role !== 'friend' || (msg.kind !== 'task_card' && msg.meta?.task_failed !== true)) return false
    const at = messageTime(msg.created_at)
    return at !== null && at >= since
  }) ?? null
}

interface PollOptions {
  intervalMs?: number
  timeoutMs?: number
  isCancelled?: () => boolean
  /** 同一頁多個待完成任務共用，結果只可結束一個輪詢。 */
  claimedIds?: Set<string>
}

/** 單次 GET 失敗略過；不重疊請求，GET 卡住也受整體期限與取消檢查保護。 */
export function pollTaskCard(
  fetchMsgs: () => Promise<FriendMessage[]>, sinceIso: string,
  { intervalMs = 2000, timeoutMs = 30000, isCancelled = () => false, claimedIds }: PollOptions = {},
): Promise<FriendMessage | null> {
  if (isCancelled() || timeoutMs <= 0) return Promise.resolve(null)
  return new Promise(resolve => {
    let settled = false, fetching = false
    const finish = (message: FriendMessage | null) => {
      if (settled) return
      settled = true
      clearInterval(interval)
      clearTimeout(timeout)
      resolve(message)
    }
    const timeout = setTimeout(() => finish(null), timeoutMs)
    const interval = setInterval(async () => {
      if (isCancelled()) return finish(null)
      if (fetching) return
      fetching = true
      try {
        const rows = await fetchMsgs()
        if (settled) return
        if (isCancelled()) return finish(null)
        const message = findTaskCardAfter(claimedIds ? rows.filter(row => !claimedIds.has(row.id)) : rows, sinceIso)
        if (message) {
          // 在 resolve 前同步認領，其他 GET 即使同時返回也不會接收同一張卡／失敗訊息。
          claimedIds?.add(message.id)
          finish(message)
        }
      } catch { /* 暫時連線失敗，下一次再試。 */ }
      finally { fetching = false }
    }, Math.max(1, intervalMs))
  })
}

interface SendDeps {
  readSendSeq(): number
  callFriendChat(text: string): Promise<FriendChatResult>
  getFriendMessages(): Promise<FriendMessage[]>
  setMessages(update: (prev: FriendMessage[]) => FriendMessage[]): void
  onConfirmed(): void
  onTask(taskId: string): void
  onTaskPending?(sinceIso: string): void
  onError(error: unknown): void
  onSettled(): void
}
/** 每个异步边界与状态提交时都复查版本；旧 POST／GET 不能覆盖新的送出。 */
export async function sendChatTurn(text: string, tempId: string, seq: number, deps: SendDeps): Promise<void> {
  const current = () => deps.readSendSeq() === seq
  try {
    const result = await deps.callFriendChat(text)
    if (!current()) return
    let serverMessages = result.messages
    if (result.messages) {
      deps.setMessages(prev => current() ? applyChatResult(prev, tempId, result) ?? prev : prev)
    } else {
      const rows = await deps.getFriendMessages()
      if (!current()) return
      serverMessages = rows
      deps.setMessages(prev => current() ? rows : prev)
    }
    if (!current()) return
    deps.onConfirmed()
    if (result.taskId) deps.onTask(result.taskId)
    if (result.taskPending) {
      const reply = serverMessages?.filter(msg => msg.role === 'friend' && msg.kind === 'chat' && !msg.meta?.task_failed).at(-1)
      if (reply && Number.isFinite(Date.parse(reply.created_at))) deps.onTaskPending?.(reply.created_at)
    }
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
