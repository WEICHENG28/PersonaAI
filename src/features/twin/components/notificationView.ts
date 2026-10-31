// C7 通知铃铛的纯函数与画面文字（不碰网络，方便测试）。拥有者：C。
// 文字先放这里：messages/strings.json 是 A 的档案，之后要搬过去再和 A 讨论。
import type { AnomalyChoice, HumanResponse, NotificationView } from '../../../lib/api/twin'

export const NOTIFY_TEXT = {
  bell: '通知',
  title: '通知',
  empty: '还没有通知',
  loadFailed: '通知暂时读不到，稍后会自动重试',
  close: '关闭',
  mutual: '双向合适',
  someone: '有人',
  match: (name: string) => `找到合适的人：${name}`,
  requestHuman: (name: string) => `${name} 想和本人聊`,
  anomaly: '提醒：对方的言行和他的描述差很多',
  friendReport: '阿澈有事想跟你说',
  respond: { now: '现在聊', later: '稍后聊', decline: '拒绝' } satisfies Record<HumanResponse, string>,
  responded: {
    now: '你选择了现在聊',
    later: '已告诉对方你晚点上线',
    decline: '已拒绝，对话已结束',
  } satisfies Record<HumanResponse, string>,
  responding: '处理中…',
  takingOver: '正在整理接手卡片，大约十几秒…',
  anomalyEvidence: '对方的具体行为',
  anomalyNote: '这只是提醒，只有你看得到，不会告诉对方。',
  choose: { continue: '继续聊', end: '结束对话', report: '检举' } satisfies Record<AnomalyChoice, string>,
  chosen: {
    continue: '你选择了继续聊',
    end: '已结束对话',
    report: '已记录检举',
  } satisfies Record<AnomalyChoice, string>,
  viewResult: '查看结果',
  goFriend: '去看看',
  goChat: '回到聊天室',
} as const

/** 铃铛上的数字：还没读的（request_human 回应后就算读了；friend_report 要阿澈说完才算读）。 */
export function unreadCount(list: readonly NotificationView[]): number {
  return list.filter((n) => !n.read).length
}

/** 请求真人还在等我回应。 */
export function isPendingRequest(n: NotificationView): boolean {
  return n.type === 'request_human' && n.response === null && !n.read
}

export function notificationTitle(n: NotificationView): string {
  const name = n.name?.trim() || NOTIFY_TEXT.someone
  if (n.type === 'match') return NOTIFY_TEXT.match(name)
  if (n.type === 'request_human') return NOTIFY_TEXT.requestHuman(name)
  if (n.type === 'anomaly') return NOTIFY_TEXT.anomaly
  return NOTIFY_TEXT.friendReport
}

/** 言行异常提醒还在等我选择。 */
export function isPendingAnomaly(n: NotificationView): boolean {
  return n.type === 'anomaly' && n.choice === null && !n.read
}

/** 点了要去哪：match → 结果页、friend_report → /friend、回应过「现在聊」的请求或言行异常提醒 → 聊天室；其他不跳转。 */
export function notificationLink(n: NotificationView): string | null {
  const conv = n.conversationId ? encodeURIComponent(n.conversationId) : null
  if (n.type === 'match') return conv ? `/chat/${conv}/result` : null
  if (n.type === 'friend_report') return '/friend'
  if (n.type === 'request_human' && n.response === 'now') return conv ? `/chat/${conv}` : null
  if (n.type === 'anomaly') return conv ? `/chat/${conv}` : null
  return null
}

/** 「10:05」或「10月30日」：今天只显示时间。 */
export function timeLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const sameDay = d.toDateString() === now.toDateString()
  const pad = (x: number) => String(x).padStart(2, '0')
  return sameDay ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : `${d.getMonth() + 1}月${d.getDate()}日`
}

/** 用回应结果更新列表里那一则（不改原阵列）。 */
export function withResponse(list: readonly NotificationView[], id: string, response: HumanResponse): NotificationView[] {
  return list.map((n) => (n.id === id ? { ...n, response, read: true } : n))
}

/** 用言行异常提醒的选择更新列表里那一则（不改原阵列）。 */
export function withChoice(list: readonly NotificationView[], id: string, choice: AnomalyChoice): NotificationView[] {
  return list.map((n) => (n.id === id ? { ...n, choice, read: true } : n))
}

/** 把那一则设为已读（不改原阵列）。 */
export function withRead(list: readonly NotificationView[], id: string): NotificationView[] {
  return list.map((n) => (n.id === id ? { ...n, read: true } : n))
}

/** 面板最宽多少、離視窗邊緣與錨點多遠（px）。 */
export const PANEL_MAX_WIDTH = 380
export const PANEL_EDGE = 16
export const PANEL_GAP = 12

export interface PanelPlacement {
  top: number
  right: number
  width: number
}

/**
 * 面板放在錨點（按鈕）下方、右緣對齊；放不下時往右推，左右都至少留 PANEL_EDGE。
 * minTop：面板 top 的下限——傳入頂欄 (.topbar) 的 bottom，
 * 按鈕在加高的頂欄裡垂直置中時，錨點 bottom + GAP 仍可能在頂欄內，會蓋住撕紙下緣，用這個參數擋住。
 */
export function panelPlacement(
  anchor: { bottom: number; right: number },
  viewportWidth: number,
  minTop = 0,
): PanelPlacement {
  const width = Math.max(0, Math.min(PANEL_MAX_WIDTH, viewportWidth - PANEL_EDGE * 2))
  const alignRight = viewportWidth - anchor.right
  const right = Math.max(PANEL_EDGE, Math.min(alignRight, viewportWidth - width - PANEL_EDGE))
  const top = Math.max(Math.round(minTop + PANEL_GAP), Math.round(anchor.bottom + PANEL_GAP))
  return { top, right, width }
}
