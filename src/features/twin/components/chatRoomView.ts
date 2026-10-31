// C4 聊天室的纯函数与画面文字（不碰网络，方便测试）。拥有者：C。
// 文字先放这里：messages/strings.json 是 A 的档案，之后要搬过去再和 A 讨论。
import type { Speaker } from '../../../components/ui/ChatBubble'
import type {
  ChatMessageView,
  ChatRoomView,
  ChatStatusView,
  Controller,
  ConversationStatus,
  Trend,
  VerdictValue,
} from '../../../lib/api/twin'

export const CHAT_TEXT = {
  mineTwin: '你的分身 · 代聊中',
  mineHuman: '你本人',
  otherTwin: '对方的分身',
  otherHuman: '对方本人',
  verdictPanel: '目前判定',
  verdictWatching: '评审 Agent 正在看对话，还没有判定',
  verdict: { suitable: '合适', uncertain: '还在观察', unsuitable: '不太合适' } satisfies Record<VerdictValue, string>,
  trend: { up: '走势上升', flat: '走势持平', down: '走势下降' } satisfies Record<Trend, string>,
  ended: '对话已结束',
  waitingHuman: '等本人接手',
  placeholderHuman: '以本人身份说点什么…',
  placeholderTwin: '现在由你的分身在聊，接手后才能输入',
  placeholderEnded: '对话已经结束',
  send: '发送',
  typing: '对方的分身正在输入…',
  takeOver: '我来聊',
  requestHuman: '请求真人',
  requestingHuman: '正在通知对方本人…',
  humanRequested: '已通知对方本人',
  humanRequestedNotice: '已经通知对方本人，等对方选择现在聊、稍后聊或拒绝',
  viewResult: '查看结果',
  replyFailed: '对方的分身暂时没有回应，稍后再发一条试试',
  statusFailed: '目前判定暂时更新不了，稍后会自动重试',
  loadFailedTitle: '打不开这段对话',
  back: '回到 AI 朋友',
} as const

/** 依时间合并两份消息，同一个 id 只留一则（Realtime 和重新读取可能重复）。 */
export function mergeMessages(current: readonly ChatMessageView[], incoming: readonly ChatMessageView[]): ChatMessageView[] {
  const byId = new Map(current.map((m) => [m.id, m]))
  for (const m of incoming) byId.set(m.id, m)
  return [...byId.values()].sort((x, y) => x.created_at.localeCompare(y.created_at) || x.id.localeCompare(y.id))
}

/**
 * 气泡样式：我方在右（分身蓝／本人薄荷），对方在左。
 * ChatBubble 没有「对方本人」样式，对方本人用左侧气泡、不挂 AI 标示来区分。
 */
export function speakerOf(message: ChatMessageView, myUserId: string): Speaker {
  if (message.sender_id === myUserId) return message.is_ai ? 'twin' : 'human'
  return 'other-twin'
}

/** 用最新的状态覆盖聊天室里的「谁在聊」与对话状态（不改原物件）。 */
export function withStatus(room: ChatRoomView, status: ChatStatusView | null): ChatRoomView {
  if (!status) return room
  return {
    ...room,
    status: status.status,
    me: { ...room.me, controller: status.myController },
    other: { ...room.other, controller: status.otherController },
  }
}

/** 可以请求对方本人：对方是分身、对话没结束（07C C4「对方是 twin 时」）。 */
export function canRequestHuman(room: ChatRoomView): boolean {
  return room.other.controller === 'twin' && room.status !== 'ended'
}

export function canType(room: ChatRoomView): boolean {
  return room.me.controller === 'human' && room.status !== 'ended'
}

/** 发送后对方分身会回：对方是分身且对话进行中。 */
export function expectsTwinReply(room: ChatRoomView): boolean {
  return room.other.controller === 'twin' && room.status === 'active'
}

export function placeholderOf(room: ChatRoomView): string {
  if (room.status === 'ended') return CHAT_TEXT.placeholderEnded
  return room.me.controller === 'human' ? CHAT_TEXT.placeholderHuman : CHAT_TEXT.placeholderTwin
}

export function sideLabel(side: 'mine' | 'other', controller: Controller): string {
  if (side === 'mine') return controller === 'human' ? CHAT_TEXT.mineHuman : CHAT_TEXT.mineTwin
  return controller === 'human' ? CHAT_TEXT.otherHuman : CHAT_TEXT.otherTwin
}

/** 「合适 · 走势上升」；还没有判定时回 null。 */
export function verdictText(verdict: ChatStatusView['verdict']): string | null {
  if (!verdict) return null
  return `${CHAT_TEXT.verdict[verdict.value]} · ${CHAT_TEXT.trend[verdict.trend]}`
}

export function statusChip(status: ConversationStatus): string | null {
  if (status === 'ended') return CHAT_TEXT.ended
  if (status === 'waiting_human') return CHAT_TEXT.waitingHuman
  return null
}
