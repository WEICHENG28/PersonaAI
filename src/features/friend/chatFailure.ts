import type { FriendMessage } from '../../lib/api/friend'

/** 失败后以服务器记录为准；无法确认时保留原文，只标记本次临时消息。 */
export function reconcileChatFailure(
  messages: FriendMessage[], tempId: string, serverMessages: FriendMessage[] | null,
): FriendMessage[] {
  if (serverMessages !== null) return serverMessages
  return messages.map(message => message.id === tempId
    ? { ...message, meta: { ...message.meta, failed: true } }
    : message)
}

/** 每段沉默最多主动接话一次；送出失败时暂停，直到错误被清除。 */
export function shouldScheduleNudge({ messages, httpError, taskPending = false }: {
  messages: FriendMessage[]
  httpError: string | null
  taskPending?: boolean
}): boolean {
  if (taskPending || httpError !== null || messages[messages.length - 1]?.role !== 'friend') return false
  const lastUserIdx = messages.map(message => message.role).lastIndexOf('user')
  return !messages.slice(lastUserIdx + 1).some(message => message.meta?.nudge === true)
}
