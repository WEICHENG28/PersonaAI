// C7 通知铃铛的纯函数与画面文字（不碰网络，方便测试）。拥有者：C。
// 文字先放这里：messages/strings.json 是 A 的档案，之后要搬过去再和 A 讨论。
import type { HumanResponse, NotificationView } from '../../../lib/api/twin'

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
  anomalyActions: ['继续聊', '结束对话', '检举'],
  comingSoon: '即将上线',
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

/** 点了要去哪：match → 结果页、friend_report → /friend、回应过「现在聊」的请求 → 聊天室；其他不跳转。 */
export function notificationLink(n: NotificationView): string | null {
  const conv = n.conversationId ? encodeURIComponent(n.conversationId) : null
  if (n.type === 'match') return conv ? `/chat/${conv}/result` : null
  if (n.type === 'friend_report') return '/friend'
  if (n.type === 'request_human' && n.response === 'now') return conv ? `/chat/${conv}` : null
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

/** 把那一则设为已读（不改原阵列）。 */
export function withRead(list: readonly NotificationView[], id: string): NotificationView[] {
  return list.map((n) => (n.id === id ? { ...n, read: true } : n))
}

/** 面板最宽多少、离视窗边缘与铃铛多远（px）。 */
export const PANEL_MAX_WIDTH = 380
export const PANEL_EDGE = 16
export const PANEL_GAP = 12

export interface PanelPlacement {
  top: number
  right: number
  width: number
}

/** 面板放在铃铛下方、右缘对齐铃铛；放不下时往右推，左右都至少留 PANEL_EDGE。 */
export function panelPlacement(anchor: { bottom: number; right: number }, viewportWidth: number): PanelPlacement {
  const width = Math.max(0, Math.min(PANEL_MAX_WIDTH, viewportWidth - PANEL_EDGE * 2))
  const alignRight = viewportWidth - anchor.right
  const right = Math.max(PANEL_EDGE, Math.min(alignRight, viewportWidth - width - PANEL_EDGE))
  return { top: Math.round(anchor.bottom + PANEL_GAP), right: Math.round(right), width }
}
