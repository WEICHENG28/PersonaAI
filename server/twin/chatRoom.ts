// C4 聊天室後端（docs/07C C4）。擁有者：C。
// 讀聊天室（雙方是誰、誰在聊、訊息）、目前判定（只有我方視角，不回任何數字）、本人發言（對方是分身就讓它回覆）。
// 外部依賴（資料庫、twinReply、日誌）都放在 ChatRoomDeps，測試可以換成假的。
import { z } from 'zod'
import type { AgentLogInput, ChatMessage, Controller, VerdictValue } from '../../shared/types'
import type { ConversationRow } from './conversation'
import type { ConversationStatus, TwinReplyFn } from './twin'

/** 本人一則訊息的字數上限（07C C4）。 */
export const MESSAGE_MAX = 1000
/** 方向分數和上一次判定相差在這個範圍內算「持平」。 */
export const TREND_FLAT_BAND = 5
/** 算走勢要讀幾筆判定（最新＋前一筆）。 */
const TREND_SCORES = 2

const VERDICT_VALUES: readonly VerdictValue[] = ['suitable', 'unsuitable', 'uncertain']

export type Trend = 'up' | 'flat' | 'down'

export interface ChatMessageView extends ChatMessage {
  guard_rewritten: boolean
}

export interface ChatRoomView {
  conversationId: string
  status: ConversationStatus
  me: { userId: string; controller: Controller }
  other: { userId: string; name: string; controller: Controller }
  messages: ChatMessageView[]
}

/** 只有文字類的值：判定與走勢，沒有分數、輪數、理由。 */
export interface ChatStatusView {
  status: ConversationStatus
  myController: Controller
  otherController: Controller
  verdict: { value: VerdictValue; trend: Trend } | null
}

export interface SendResult {
  message: ChatMessageView
  /** 對方分身有回覆。 */
  replied: boolean
  /** 應該回覆但失敗了（本人訊息已經存好）。 */
  replyFailed: boolean
}

/** match_scores 一列裡算判定和走勢用得到的欄位；只在後端用，不回給前端。 */
export interface ScoreRow {
  round: number
  direction_score: number
  verdict: VerdictValue
}

export interface NewHumanMessage {
  conversation_id: string
  sender_id: string
  content: string
}

export interface ChatRoomStore {
  getConversation(id: string): Promise<ConversationRow | null>
  getDisplayName(userId: string): Promise<string>
  /** 依時間由舊到新。 */
  listMessages(conversationId: string): Promise<ChatMessageView[]>
  insertHumanMessage(row: NewHumanMessage): Promise<ChatMessageView>
  /** 這個視角最新的幾筆判定，新的在前。 */
  listMyScores(conversationId: string, perspectiveUserId: string, limit: number): Promise<ScoreRow[]>
}

export interface ChatRoomDeps {
  store: ChatRoomStore
  twinReply: TwinReplyFn
  writeLog(entry: AgentLogInput): Promise<void>
}

export interface ChatRoomApi {
  getChatRoom(conversationId: string, userId: string): Promise<ChatRoomView>
  getChatStatus(conversationId: string, userId: string): Promise<ChatStatusView>
  sendHumanMessage(conversationId: string, userId: string, text: string): Promise<SendResult>
}

/** 給用戶看的錯誤；status 是 HTTP 狀態碼。 */
export class ChatRoomError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 503,
  ) {
    super(message)
    this.name = 'ChatRoomError'
  }
}

export const messageBodySchema = z.object({ text: z.string().trim().min(1).max(MESSAGE_MAX) })

export interface Sides {
  conv: ConversationRow
  me: { userId: string; controller: Controller }
  other: { userId: string; controller: Controller }
}

/** 讀對話並確認 userId 是其中一方；不是就 403。 */
export async function loadSides(
  store: Pick<ChatRoomStore, 'getConversation'>,
  conversationId: string,
  userId: string,
): Promise<Sides> {
  const conv = await store.getConversation(conversationId)
  if (!conv) throw new ChatRoomError('找不到这段对话', 404)
  const a = { userId: conv.side_a, controller: conv.side_a_controller }
  const b = { userId: conv.side_b, controller: conv.side_b_controller }
  if (userId === a.userId) return { conv, me: a, other: b }
  if (userId === b.userId) return { conv, me: b, other: a }
  throw new ChatRoomError('你不是这段对话的成员，不能查看', 403)
}

/** 最新一筆和前一筆的方向分數比較；只有一筆時算持平。 */
export function trendOf(scores: readonly ScoreRow[]): Trend {
  const [latest, prev] = scores
  if (!latest || !prev) return 'flat'
  const diff = latest.direction_score - prev.direction_score
  if (diff > TREND_FLAT_BAND) return 'up'
  if (diff < -TREND_FLAT_BAND) return 'down'
  return 'flat'
}

export function toVerdictValue(raw: string): VerdictValue {
  return (VERDICT_VALUES as readonly string[]).includes(raw) ? (raw as VerdictValue) : 'uncertain'
}

async function getChatRoom(deps: ChatRoomDeps, conversationId: string, userId: string): Promise<ChatRoomView> {
  const { conv, me, other } = await loadSides(deps.store, conversationId, userId)
  const [name, messages] = await Promise.all([
    deps.store.getDisplayName(other.userId),
    deps.store.listMessages(conversationId),
  ])
  return { conversationId: conv.id, status: conv.status, me: { ...me }, other: { ...other, name }, messages }
}

async function getChatStatus(deps: ChatRoomDeps, conversationId: string, userId: string): Promise<ChatStatusView> {
  const { conv, me, other } = await loadSides(deps.store, conversationId, userId)
  // 只讀「我」這個視角的判定；對方視角的分數與理由一律不讀
  const scores = await deps.store.listMyScores(conversationId, me.userId, TREND_SCORES)
  const latest = scores[0]
  return {
    status: conv.status,
    myController: me.controller,
    otherController: other.controller,
    verdict: latest ? { value: toVerdictValue(latest.verdict), trend: trendOf(scores) } : null,
  }
}

/** 對方分身回覆；失敗只寫日誌，不讓本人的訊息跟著失敗。 */
async function askOtherTwin(deps: ChatRoomDeps, conv: ConversationRow, otherUserId: string): Promise<boolean> {
  try {
    await deps.twinReply(conv.id, otherUserId)
    return true
  } catch (err) {
    console.error('[twin] 本人发言后分身回复失败', conv.id, err)
    await deps.writeLog({
      user_id: otherUserId,
      agent: 'twin',
      conversation_id: conv.id,
      task_id: conv.task_id ?? undefined,
      action: '分身没有回上',
      reason: '对方本人发言后，分身回复时出错',
      detail: { error: err instanceof Error ? err.message : String(err) },
    })
    return false
  }
}

async function sendHumanMessage(deps: ChatRoomDeps, conversationId: string, userId: string, text: string): Promise<SendResult> {
  const body = messageBodySchema.safeParse({ text })
  if (!body.success) throw new ChatRoomError(`消息要在 1–${MESSAGE_MAX} 字之间`, 400)
  const { conv, me, other } = await loadSides(deps.store, conversationId, userId)
  if (conv.status === 'ended') throw new ChatRoomError('这段对话已经结束了', 409)
  if (me.controller !== 'human') throw new ChatRoomError('现在由你的分身在聊，接手后才能发言', 409)

  const message = await deps.store.insertHumanMessage({ conversation_id: conv.id, sender_id: me.userId, content: body.data.text })
  const shouldReply = other.controller === 'twin' && conv.status === 'active'
  if (!shouldReply) return { message, replied: false, replyFailed: false }
  const replied = await askOtherTwin(deps, conv, other.userId)
  return { message, replied, replyFailed: !replied }
}

export function createChatRoomApi(deps: ChatRoomDeps): ChatRoomApi {
  return {
    getChatRoom: (id, userId) => getChatRoom(deps, id, userId),
    getChatStatus: (id, userId) => getChatStatus(deps, id, userId),
    sendHumanMessage: (id, userId, text) => sendHumanMessage(deps, id, userId, text),
  }
}
