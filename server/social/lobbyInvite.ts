// 真人進大廳的邀請（Peter 2026-10-31）：和阿澈聊夠了、對外檔案也有內容，就邀請用戶一鍵加入大廳。
// 加入＝確認對外檔案＋開啟社交 Agent；之後 searchLobby 和大廳就會把他和種子用戶混在一起配對。
// 一定要用戶按「加入」才生效（對外資料要本人同意，02 F4）。擁有者：B。
import type { ShareableProfile } from '../../shared/types.js'
import { CONFIG } from '../lib/config.js'

export interface LobbyInviteState {
  userMessages: number
  shareable: ShareableProfile | null
  confirmed: boolean
  socialAgentEnabled: boolean
}

export interface LobbyInviteDeps {
  load(userId: string): Promise<LobbyInviteState>
  /** 背景撷取還沒跑到（或在 Vercel 被中斷）時，補撷取一次對外檔案。 */
  extractProfile(userId: string): Promise<void>
  /** 確認對外檔案（含算向量）並開啟社交 Agent。 */
  join(userId: string, shareable: ShareableProfile): Promise<void>
}

export type LobbyInviteView =
  | { status: 'in_lobby' }
  | { status: 'not_yet'; userMessages: number; need: number; reason: string }
  | { status: 'invite'; shareable: ShareableProfile }

/** 對外檔案夠完整才邀請：有一句話介紹、至少 2 個興趣。 */
export function isProfileComplete(p: ShareableProfile | null): p is ShareableProfile {
  return Boolean(p && p.intro.trim() && p.interests.filter((i) => i.trim()).length >= 2)
}

export async function getLobbyInvite(userId: string, deps: LobbyInviteDeps): Promise<LobbyInviteView> {
  let state = await deps.load(userId)
  if (state.confirmed && state.socialAgentEnabled) return { status: 'in_lobby' }

  const need = CONFIG.LOBBY_INVITE_MIN_MESSAGES
  if (state.userMessages < need) {
    return { status: 'not_yet', userMessages: state.userMessages, need, reason: `再和阿澈聊 ${need - state.userMessages} 句` }
  }
  if (!isProfileComplete(state.shareable)) {
    await deps.extractProfile(userId)
    state = await deps.load(userId)
  }
  if (!isProfileComplete(state.shareable)) {
    return { status: 'not_yet', userMessages: state.userMessages, need, reason: '阿澈还不太了解你的兴趣，多聊聊你喜欢做什么' }
  }
  return { status: 'invite', shareable: state.shareable }
}

export async function acceptLobbyInvite(userId: string, deps: LobbyInviteDeps): Promise<LobbyInviteView> {
  const view = await getLobbyInvite(userId, deps)
  if (view.status === 'in_lobby') return view
  if (view.status === 'not_yet') return view
  await deps.join(userId, view.shareable)
  return { status: 'in_lobby' }
}
