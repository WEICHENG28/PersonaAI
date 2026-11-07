import { getLobbyInvite, getOnboarding } from '../../lib/api/social'

/** null 代表聊天记录尚未载入；0 则是已确认没有用户消息。 */
export function loadLobbyInviteAfterMessages(userMessageCount: number | null) {
  return userMessageCount === null ? null : getLobbyInvite()
}

export function loadOnboardingAfterMessages(userMessageCount: number | null) {
  return userMessageCount === null ? null : getOnboarding()
}
