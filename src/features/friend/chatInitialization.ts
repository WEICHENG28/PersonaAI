import type { FriendMessage, UserSettings } from '../../lib/api/friend'

interface FriendInitializationDeps {
  callFriendIntro(): Promise<void>
  deliverReports(): Promise<number>
  getFriendMessages(): Promise<FriendMessage[]>
  fetchSettings(): Promise<UserSettings | null>
  readSendSeq(): number
  isSending(): boolean
  isActive(): boolean
  onMessages(messages: FriendMessage[]): void
  onSettings(settings: UserSettings | null): void
  onMessagesError(error: unknown): void
}

/** GET 发出后，或初始化前置工作期间有手动送出，就让送出流程负责更新列表。 */
export function shouldApplyInitMessages(requestSeq: number, currentSeq: number, initialSeq = requestSeq): boolean {
  return requestSeq === currentSeq && initialSeq === currentSeq
}

export async function initializeFriendPage(deps: FriendInitializationDeps): Promise<void> {
  const initialSeq = deps.readSendSeq()
  const startedDuringSend = deps.isSending()
  const settings = deps.fetchSettings()
    .then(value => { if (deps.isActive()) deps.onSettings(value) })
    .catch(() => { /* 面板默认不显示，不阻塞消息 */ })
  await Promise.allSettled([deps.callFriendIntro(), deps.deliverReports()])
  if (deps.isActive()) {
    const seq = deps.readSendSeq()
    try {
      const messages = await deps.getFriendMessages()
      if (deps.isActive() && !startedDuringSend &&
        shouldApplyInitMessages(seq, deps.readSendSeq(), initialSeq)) {
        deps.onMessages(messages)
      }
    } catch (error) {
      if (deps.isActive()) deps.onMessagesError(error)
    }
  }
  await settings
}
