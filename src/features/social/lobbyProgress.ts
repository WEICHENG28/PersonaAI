// 進大廳進度的純函式（不碰畫面，方便測試）。擁有者：B。
import type { LobbyInviteView } from '../../lib/api/social'

/** 進大廳進度（0–100）：句數佔 90%，對外檔案整理好再補滿。 */
export function lobbyProgress(view: Extract<LobbyInviteView, { status: 'not_yet' }>): number {
  const chat = Math.min(1, view.userMessages / Math.max(1, view.need))
  return Math.round(chat * 90)
}
