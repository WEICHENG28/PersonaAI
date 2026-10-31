// C7 請求真人（docs/07C C7、02 F7）。擁有者：C。
// POST /api/conversations/:id/request-human：我在和對方的分身聊天時，通知對方本人（type request_human，
// payload { conversationId, fromName }）；對方是種子用戶時 3 秒後自動用 CONFIG.SEED_AUTO_RESPONSE 回應。
// POST /api/notifications/:id/respond：now → C6 接手；later → 分身送出固定的「本人晚点会上线，我们可以先继续聊」，
// 之後照常輕聊；decline → 拒絕的人的分身收尾、結束。動作失敗時把回應改回未回應，讓用戶可以重按。
// 外部依賴（資料庫、C6 接手、分身、結束對話、日誌、計時）都放在 RequestHumanDeps，測試可以換成假的。
import { z } from 'zod'
import type { AgentLogInput } from '../../shared/types.js'
import { ChatRoomError, loadSides, type ChatRoomStore } from './chatRoom.js'
import type { TakeoverView } from './handoff.js'

/** 種子用戶被請求真人後，幾毫秒自動回應（07C C7）。 */
export const SEED_RESPONSE_DELAY_MS = 3000

/**
 * 回應 later 時分身送出的話（07C C7 原句）。用固定文字不經過 LLM：
 * 讓模型說時實測會改成「我／他晚点会上线」，對方分不清是誰要上線。
 */
export const LATER_MESSAGE = '本人晚点会上线，我们可以先继续聊。'

export type HumanResponse = 'now' | 'later' | 'decline'
export type NotificationType = 'match' | 'request_human' | 'friend_report' | 'anomaly'

export const humanResponseSchema = z.enum(['now', 'later', 'decline'])

const RESPONSE_TEXT: Record<HumanResponse, string> = { now: '现在聊', later: '稍后聊', decline: '拒绝' }

/** notifications 一列（docs/07 第 4 節）。 */
export interface NotificationRow {
  id: string
  user_id: string
  type: NotificationType
  payload: Record<string, unknown>
  response: HumanResponse | null
  read_at: string | null
  created_at: string
}

export interface RequestHumanPayload {
  conversationId: string
  fromName: string
}

export interface RequestHumanStore extends Pick<ChatRoomStore, 'getConversation' | 'getDisplayName'> {
  isSeedUser(userId: string): Promise<boolean>
  /** 這段對話發給這位用戶、還沒回應的請求真人通知 id；沒有回 null。 */
  findPendingRequest(conversationId: string, userId: string): Promise<string | null>
  insertRequestNotification(userId: string, payload: RequestHumanPayload): Promise<{ id: string }>
  getNotification(id: string): Promise<NotificationRow | null>
  /** 只在還沒回應時寫入回應並設為已讀；回傳有沒有寫到（同時回應兩次只有一次成功）。 */
  saveResponse(id: string, response: HumanResponse, readAt: string): Promise<boolean>
  /** 設為已讀（只改自己的、還沒讀過的）。 */
  markRead(id: string, userId: string, readAt: string): Promise<void>
  /** 動作失敗時把回應與已讀改回 null，讓用戶可以重按。 */
  clearResponse(id: string): Promise<void>
}

export interface RequestHumanDeps {
  store: RequestHumanStore
  /** C6 本人接手。 */
  takeOver(conversationId: string, userId: string): Promise<TakeoverView>
  /** 以這位用戶的分身送出一則固定的 AI 訊息（is_ai = true）。 */
  postTwinMessage(conversationId: string, speakerUserId: string, content: string): Promise<void>
  /** C3 結束對話：closerUserId 的分身禮貌收尾。 */
  endConversation(conversationId: string, reason: 'declined', closerUserId: string): Promise<void>
  writeLog(entry: AgentLogInput): Promise<void>
  schedule(ms: number, run: () => void): void
  now(): Date
  seedAutoResponse: HumanResponse
}

export interface RespondView {
  response: HumanResponse
  conversationId: string
  /** now 且這次真的接手時才有：C6 的接手卡片。 */
  handoff: TakeoverView | null
}

export interface RequestHumanApi {
  requestHuman(conversationId: string, userId: string): Promise<{ notificationId: string }>
  respond(notificationId: string, userId: string, response: HumanResponse): Promise<RespondView>
}

const payloadConversationSchema = z.object({ conversationId: z.string().min(1) })

async function requestHuman(deps: RequestHumanDeps, running: Set<string>, conversationId: string, userId: string) {
  const { conv, me, other } = await loadSides(deps.store, conversationId, userId)
  if (conv.status === 'ended') throw new ChatRoomError('这段对话已经结束了', 409)
  if (other.controller !== 'twin') throw new ChatRoomError('对方本人已经在聊了，直接说话就好', 409)
  // 同一個人同時按兩次（或兩個分頁）只發一則；跨程序靠 findPendingRequest
  const key = `${conv.id}:${me.userId}`
  if (running.has(key)) throw new ChatRoomError('已经请求过了，等对方回应', 409)
  running.add(key)
  try {
    if (await deps.store.findPendingRequest(conv.id, other.userId)) {
      throw new ChatRoomError('已经请求过了，等对方回应', 409)
    }
    const fromName = await deps.store.getDisplayName(me.userId)
    const { id } = await deps.store.insertRequestNotification(other.userId, { conversationId: conv.id, fromName })
    await deps.writeLog({
      user_id: me.userId,
      agent: 'twin',
      conversation_id: conv.id,
      task_id: conv.task_id ?? undefined,
      action: '请求对方本人上线',
      reason: '你在聊天室按了「请求真人」，已经通知对方本人',
      detail: { notification_id: id },
    })
    if (await deps.store.isSeedUser(other.userId)) scheduleSeedResponse(deps, id, other.userId)
    return { notificationId: id }
  } finally {
    running.delete(key)
  }
}

/** 種子用戶沒有真人會回應：SEED_RESPONSE_DELAY_MS 後自動回應；失敗只記錄。 */
function scheduleSeedResponse(deps: RequestHumanDeps, notificationId: string, seedUserId: string): void {
  deps.schedule(SEED_RESPONSE_DELAY_MS, () => {
    respond(deps, notificationId, seedUserId, deps.seedAutoResponse, true).catch((err: unknown) => {
      console.error('[twin] 种子用户自动回应请求真人失败', notificationId, err)
    })
  })
}

/** 讀通知並確認是自己的、是請求真人、還沒回應；回傳對話 id。 */
async function loadRequest(deps: RequestHumanDeps, notificationId: string, userId: string): Promise<string> {
  const note = await deps.store.getNotification(notificationId)
  if (!note || note.user_id !== userId) throw new ChatRoomError('找不到这则通知', 404)
  if (note.type !== 'request_human') throw new ChatRoomError('这则通知不需要回应', 400)
  if (note.response) throw new ChatRoomError('你已经回应过了', 409)
  const payload = payloadConversationSchema.safeParse(note.payload)
  if (!payload.success) throw new ChatRoomError('找不到这段对话', 404)
  return payload.data.conversationId
}

/** 照回應動作；我方已經本人在聊（例如先按了「我来聊」）時不再接手、不讓分身說話、不結束。 */
async function act(deps: RequestHumanDeps, conversationId: string, userId: string, response: HumanResponse) {
  if (response === 'now') return deps.takeOver(conversationId, userId)
  if (response === 'later') await deps.postTwinMessage(conversationId, userId, LATER_MESSAGE)
  if (response === 'decline') await deps.endConversation(conversationId, 'declined', userId)
  return null
}

/** 動作失敗：回應改回未回應（用戶可以重按），再把原本的錯誤丟出去。 */
async function rollback(deps: RequestHumanDeps, notificationId: string, err: unknown): Promise<never> {
  console.error('[twin] 回应请求真人失败，改回未回应', notificationId, err)
  try {
    await deps.store.clearResponse(notificationId)
  } catch (clearErr) {
    console.error('[twin] 改回未回应失败', notificationId, clearErr)
  }
  if (err instanceof ChatRoomError) throw err
  throw new ChatRoomError('刚才没处理成功，请再选一次', 503)
}

async function respond(
  deps: RequestHumanDeps,
  notificationId: string,
  userId: string,
  response: HumanResponse,
  auto = false,
): Promise<RespondView> {
  const conversationId = await loadRequest(deps, notificationId, userId)
  const { conv, me } = await loadSides(deps.store, conversationId, userId)
  const readAt = deps.now().toISOString()
  if (conv.status === 'ended') {
    // 對話已經結束，回應沒有意義；設為已讀，鈴鐺上就不會一直掛著
    await deps.store.markRead(notificationId, userId, readAt)
    throw new ChatRoomError('这段对话已经结束了', 409)
  }
  // 先記下回應再動作：連按兩次時只有第一次會接手／收尾
  if (!(await deps.store.saveResponse(notificationId, response, readAt))) {
    throw new ChatRoomError('你已经回应过了', 409)
  }

  const isTwin = me.controller === 'twin'
  const handoff = isTwin ? await act(deps, conv.id, userId, response).catch((err) => rollback(deps, notificationId, err)) : null

  const detail: Record<string, unknown> = { notification_id: notificationId, response }
  if (auto) detail.auto = true
  if (!isTwin) detail.already_human = true
  await deps.writeLog({
    user_id: userId,
    agent: 'twin',
    conversation_id: conv.id,
    task_id: conv.task_id ?? undefined,
    action: `回应请求真人：${RESPONSE_TEXT[response]}`,
    reason: auto ? `种子用户没有真人，自动回应「${RESPONSE_TEXT[response]}」` : `对方想和你本人聊，你选择了「${RESPONSE_TEXT[response]}」`,
    detail,
  })
  return { response, conversationId: conv.id, handoff }
}

export function createRequestHumanApi(deps: RequestHumanDeps): RequestHumanApi {
  const running = new Set<string>()
  return {
    requestHuman: (id, userId) => requestHuman(deps, running, id, userId),
    respond: (id, userId, response) => respond(deps, id, userId, response),
  }
}
