// C6 本人接手的纯函数与画面文字（不碰网络，方便测试）。拥有者：C。
// strings.json 已有的文字（handoff.*）照旧用 t()；这里只放新增的，之后要搬过去再和 A 讨论。
import type { ConversationStatus, Controller, TakeoverView } from '../../../lib/api/twin'

export const HANDOFF_TEXT = {
  taking: '正在整理接手卡片，大约十几秒…',
  twinSaidSub: '接手后别说矛盾的话',
  otherHighlights: '对方在意的事与亮点',
  openTopics: '还没聊完的话题',
  empty: '暂无',
  summaryFailed: '接手卡片暂时没整理出来，可以先看看前面的对话再接话',
  ended: '这段对话已经结束了',
  alreadyHuman: '你已经本人接手了',
  goChat: '回到聊天室',
} as const

interface TakeoverSubject {
  status: ConversationStatus
  me: { controller: Controller }
}

/** 不能接手的原因；可以接手时回 null（和后端 takeoverBlock 一致）。 */
export function takeoverBlockOf(subject: TakeoverSubject): string | null {
  if (subject.status === 'ended') return HANDOFF_TEXT.ended
  if (subject.me.controller !== 'twin') return HANDOFF_TEXT.alreadyHuman
  return null
}

/** 结果页接手后带进聊天室的路由 state；格式不对就当没有（history state 可能是旧的或别的页面放的）。 */
export interface HandoffRouteState {
  handoff: TakeoverView
}

export function readHandoffState(state: unknown, conversationId: string): TakeoverView | null {
  if (!state || typeof state !== 'object' || !('handoff' in state)) return null
  const view = (state as { handoff: unknown }).handoff
  if (!view || typeof view !== 'object') return null
  const v = view as Partial<TakeoverView>
  if (v.conversationId !== conversationId || !isSummary(v.summary)) return null
  return view as TakeoverView
}

const SUMMARY_KEYS = ['key_points', 'other_highlights', 'twin_said', 'open_topics', 'suggested_replies'] as const

function isSummary(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  return SUMMARY_KEYS.every((k) => Array.isArray((value as Record<string, unknown>)[k]))
}
