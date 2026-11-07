import type { FriendMessage, UserSettings } from '../../lib/api/friend'

interface FriendInitializationDeps {
  callFriendIntro(): Promise<void>
  deliverReports(): Promise<number>
  getFriendMessages(): Promise<FriendMessage[]>
  fetchSettings(): Promise<UserSettings | null>
  readSendSeq(): number
  isSending(): boolean
  hasUnconfirmedSend(): boolean
  isActive(): boolean
  onMessages(messages: FriendMessage[]): void
  onSettings(settings: UserSettings | null): void
  onMessagesError(error: unknown): void
}

/** GET 发出时有待确认的本机消息，或之后又开始送出时，不覆盖聊天列表。 */
export function shouldApplyInitMessages(requestSeq: number, currentSeq: number, blockedAtRead = false): boolean {
  return requestSeq === currentSeq && !blockedAtRead
}

export async function initializeFriendPage(deps: FriendInitializationDeps): Promise<void> {
  const settings = deps.fetchSettings()
    .then(value => { if (deps.isActive()) deps.onSettings(value) })
    .catch(() => { /* 面板默认不显示，不阻塞消息 */ })
  await Promise.allSettled([deps.callFriendIntro(), deps.deliverReports()])
  if (deps.isActive()) {
    const seq = deps.readSendSeq()
    const blockedAtRead = deps.isSending() || deps.hasUnconfirmedSend()
    try {
      const messages = await deps.getFriendMessages()
      if (deps.isActive() && shouldApplyInitMessages(seq, deps.readSendSeq(), blockedAtRead)) {
        deps.onMessages(messages)
      }
    } catch (error) {
      if (deps.isActive()) deps.onMessagesError(error)
    }
  }
  await settings
}
