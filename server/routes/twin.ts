// C 線的 API 路由，掛在 /api 底下（例如 twinRoutes.get('/xxx') → GET /api/xxx）。擁有者：C。
// 回應格式：成功 { ok: true, data }，失敗 { ok: false, error: '给用户看的简体中文讯息' }。
// 所有 /conversations/:id/* 先確認呼叫者是這段對話的一方，否則 403（07C 第 4 節）。
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { isAuthFailure, requireAuth } from '../lib/auth.js'
import { writeLog } from '../lib/log.js'
import { CONFIG } from '../lib/config.js'
import { getServiceClient } from '../lib/supabase.js'
import { runTwinRounds, startConversation } from '../contracts/twin.js'
import { ChatRoomError, createChatRoomApi, MESSAGE_MAX, messageBodySchema, type ChatRoomApi } from '../twin/chatRoom.js'
import { supabaseChatRoomStore } from '../twin/chatRoomStore.js'
import { createHandoffApi, type HandoffApi } from '../twin/handoff.js'
import { supabaseHandoffStore } from '../twin/handoffStore.js'
import { llmJson } from '../lib/llm/index.js'
import { supabaseNotificationStore } from '../twin/notificationStore.js'
import { createNotificationApi, type NotificationApi } from '../twin/notifications.js'
import { createRequestHumanApi, humanResponseSchema, type RequestHumanApi } from '../twin/requestHuman.js'
import { anomalyChoiceSchema, createAnomalyApi, type AnomalyApi } from '../twin/anomaly.js'
import { supabaseAnomalyStore } from '../twin/anomalyStore.js'
import { getShareableProfile, getStyleProfile } from '../contracts/friend.js'
import { createResultApi, type ResultApi } from '../twin/result.js'
import { supabaseResultStore } from '../twin/resultStore.js'
import { twinReply } from '../twin/twin.js'
import { createConversationApi, defaultConversationDeps, type ConversationApi } from '../twin/conversation.js'
import { supabaseTwinStore } from '../twin/store.js'
import { createLobbyApi, lobbyQuerySchema, targetBodySchema, type LobbyApi } from '../twin/lobby.js'
import { supabaseLobbyStore } from '../twin/lobbyStore.js'
import { createSingleTargetTask, createTaskFromText, searchLobby } from '../contracts/social.js'
import { QUESTION_MAX } from '../twin/lobbyAssistant.js'

/** 回 users.id；失敗回已寫好的 401／403 Response。 */
export type ResolveUserId = (c: Context) => Promise<string | Response>

export interface TwinRouteDeps {
  chatRoom(): ChatRoomApi
  result(): ResultApi
  handoff(): HandoffApi
  requestHuman(): RequestHumanApi
  notifications(): NotificationApi
  anomaly(): AnomalyApi
  lobby(): LobbyApi
  resolveUserId: ResolveUserId
}

const idSchema = z.uuid()
const questionSchema = z.object({ question: z.string().trim().min(1).max(QUESTION_MAX) })
const NOTIFICATION_NOT_FOUND = '找不到这则通知'
// request_human：now／later／decline；anomaly（C8）：continue／end／report
const respondBodySchema = z.object({ response: z.union([humanResponseSchema, anomalyChoiceSchema]) })

/** Bearer JWT → auth 用戶 → users.id。 */
async function resolveAppUserId(c: Context): Promise<string | Response> {
  const authed = await requireAuth(c)
  if (isAuthFailure(authed)) return authed
  const { data, error } = await getServiceClient().from('users').select('id').eq('auth_id', authed.authId).maybeSingle()
  if (error) throw new Error(`读取用户失败：${error.message}`)
  if (!data) return c.json({ ok: false, error: '找不到你的用户资料，请重新进入一次' }, 403)
  return data.id as string
}

/** 先確認登入與 id（對話或通知），再執行 run；ChatRoomError 原樣回給用戶，其他錯誤交給 app.onError。 */
async function respond<T>(
  c: Context,
  deps: TwinRouteDeps,
  run: (id: string, userId: string) => Promise<T>,
  notFound = '找不到这段对话',
) {
  const userId = await deps.resolveUserId(c)
  if (userId instanceof Response) return userId
  const id = idSchema.safeParse(c.req.param('id'))
  if (!id.success) return c.json({ ok: false, error: notFound }, 404)
  try {
    return c.json({ ok: true, data: await run(id.data, userId) })
  } catch (err) {
    if (err instanceof ChatRoomError) return c.json({ ok: false, error: err.message }, err.status)
    throw err
  }
}

/** 不需要對話 id 的路由（大廳）：先確認登入，ChatRoomError 原樣回給用戶。 */
async function respondAsUser<T>(c: Context, deps: TwinRouteDeps, run: (userId: string) => Promise<T>) {
  const userId = await deps.resolveUserId(c)
  if (userId instanceof Response) return userId
  try {
    return c.json({ ok: true, data: await run(userId) })
  } catch (err) {
    if (err instanceof ChatRoomError) return c.json({ ok: false, error: err.message }, err.status)
    throw err
  }
}

/** 大廳兩個按鈕的 body：{ targetUserId }。 */
async function readTarget(c: Context): Promise<string> {
  const body = targetBodySchema.safeParse(await c.req.json().catch(() => null))
  if (!body.success) throw new ChatRoomError('请选择要聊天的用户', 400)
  return body.data.targetUserId
}

export function createTwinRoutes(deps: TwinRouteDeps): Hono {
  const routes = new Hono()

  // C4 聊天室：雙方是誰、誰在聊、完整訊息
  routes.get('/conversations/:id', (c) => respond(c, deps, (id, userId) => deps.chatRoom().getChatRoom(id, userId)))

  // C4 目前判定：只有我方視角的判定與走勢，沒有數字
  routes.get('/conversations/:id/status', (c) => respond(c, deps, (id, userId) => deps.chatRoom().getChatStatus(id, userId)))

  // C4 本人發言：{ text }（1–1000 字）；對方是分身且對話進行中就讓它回覆
  routes.post('/conversations/:id/messages', async (c) => {
    const body = messageBodySchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ ok: false, error: `消息要在 1–${MESSAGE_MAX} 字之间` }, 400)
    return respond(c, deps, (id, userId) => deps.chatRoom().sendHumanMessage(id, userId, body.data.text))
  })

  // C5 結果頁：我方視角的判定、雙向合適、為什麼你們合、大綱、完整紀錄（不回任何分數與對方視角）
  routes.get('/conversations/:id/result', (c) => respond(c, deps, (id, userId) => deps.result().getResult(id, userId)))

  // C5 讓分身繼續聊：runTwinRounds(id, ROUNDS_PER_STEP) 一次，跑完才回應
  routes.post('/conversations/:id/continue', (c) => respond(c, deps, (id, userId) => deps.result().continueTwin(id, userId)))

  // C6 本人接手：產生接手卡片（只用我方視角的判定）、我方改成本人、寫入 handoffs；接手後不再交回分身
  routes.post('/conversations/:id/takeover', (c) => respond(c, deps, (id, userId) => deps.handoff().takeOver(id, userId)))

  // C7 請求真人：通知對方本人（對方是分身、對話沒結束、還沒請求過）；種子用戶 3 秒後自動回應
  routes.post('/conversations/:id/request-human', (c) =>
    respond(c, deps, (id, userId) => deps.requestHuman().requestHuman(id, userId)),
  )

  // C7 通知鈴鐺：自己最近的通知（只有鈴鐺要顯示的欄位）
  routes.get('/notifications', async (c) => {
    const userId = await deps.resolveUserId(c)
    if (userId instanceof Response) return userId
    return c.json({ ok: true, data: await deps.notifications().list(userId) })
  })

  // C7 回應請求真人 { response: 'now' | 'later' | 'decline' }；C8 回應言行異常提醒 { response: 'continue' | 'end' | 'report' }。
  // 先確認登入與 id，再看內容；通知類型和回應不合時由各自的函式回 400
  routes.post('/notifications/:id/respond', (c) =>
    respond(c, deps, async (id, userId) => {
      const body = respondBodySchema.safeParse(await c.req.json().catch(() => null))
      if (!body.success) throw new ChatRoomError('请选择一个选项', 400)
      const choice = anomalyChoiceSchema.safeParse(body.data.response)
      if (choice.success) return deps.anomaly().respond(id, userId, choice.data)
      return deps.requestHuman().respond(id, userId, humanResponseSchema.parse(body.data.response))
    }, NOTIFICATION_NOT_FOUND),
  )

  // C7「找到合适的人」點開後設為已讀
  routes.post('/notifications/:id/read', (c) =>
    respond(c, deps, async (id, userId) => {
      await deps.notifications().markRead(id, userId)
      return { id }
    }, NOTIFICATION_NOT_FOUND),
  )

  // C9 大廳卡片：?purpose=&q=；只回卡片內容與文字的 AI 預估，沒有數字
  routes.get('/lobby', (c) =>
    respondAsUser(c, deps, async (userId) => {
      const query = lobbyQuerySchema.safeParse(c.req.query())
      if (!query.success) throw new ChatRoomError('筛选条件不正确，关键字最多 30 字', 400)
      return deps.lobby().listLobby(userId, query.data)
    }),
  )

  // C9「我自己聊」：我本人 ↔ 對方分身，回 conversationId（前端導向聊天室）
  routes.post('/conversations', (c) =>
    respondAsUser(c, deps, async (userId) => deps.lobby().startHumanChat(userId, await readTarget(c))),
  )

  // C10 大廳 AI 助手：{ question }；像交辦任務就建任務（回 taskId），否則回答＋候選人小卡片（都沒有分數）
  routes.post('/lobby/assistant', (c) =>
    respondAsUser(c, deps, async (userId) => {
      const body = questionSchema.safeParse(await c.req.json().catch(() => null))
      if (!body.success) throw new ChatRoomError(`问题要在 1–${QUESTION_MAX} 字之间`, 400)
      return deps.lobby().ask(userId, body.data.question)
    }),
  )

  // C9「讓分身去聊」：B 的 createSingleTargetTask，回 taskId（前端導向任務頁）
  routes.post('/lobby/twin-chat', (c) =>
    respondAsUser(c, deps, async (userId) => deps.lobby().startTwinChat(userId, await readTarget(c))),
  )

  return routes
}

let lobbyApi: LobbyApi | null = null
let chatRoomApi: ChatRoomApi | null = null
let resultApi: ResultApi | null = null
let handoffApi: HandoffApi | null = null
let requestHumanApi: RequestHumanApi | null = null
let notificationApi: NotificationApi | null = null
let conversationApi: ConversationApi | null = null
let anomalyApi: AnomalyApi | null = null

const getConversationApi = (): ConversationApi => (conversationApi ??= createConversationApi(defaultConversationDeps()))

const getAnomalyApi = (): AnomalyApi =>
  (anomalyApi ??= createAnomalyApi({
    store: supabaseAnomalyStore(),
    getShareableProfile,
    getStyleProfile,
    llmJson,
    writeLog,
    endConversation: (id, closerUserId) => getConversationApi().endConversation(id, 'anomaly', { closerUserId }),
    now: () => new Date(),
    minMessages: CONFIG.ANOMALY_MIN_MESSAGES,
    checkEvery: CONFIG.ANOMALY_CHECK_EVERY,
  }))

const getHandoffApi = (): HandoffApi =>
  (handoffApi ??= createHandoffApi({ store: supabaseHandoffStore(), llmJson, writeLog }))

export const twinRoutes = createTwinRoutes({
  chatRoom: () =>
    (chatRoomApi ??= createChatRoomApi({
      store: supabaseChatRoomStore(),
      twinReply,
      writeLog,
      // C8：每則本人訊息後背景檢查言行異常，不擋發言
      afterHumanMessage: (id, userId) => void getAnomalyApi().checkAfterHumanMessage(id, userId),
    })),
  result: () =>
    (resultApi ??= createResultApi({
      store: supabaseResultStore(),
      runTwinRounds,
      writeLog,
      roundsPerStep: CONFIG.ROUNDS_PER_STEP,
      maxRounds: CONFIG.MAX_ROUNDS,
    })),
  handoff: getHandoffApi,
  requestHuman: () =>
    (requestHumanApi ??= createRequestHumanApi({
      store: supabaseNotificationStore(),
      takeOver: (id, userId) => getHandoffApi().takeOver(id, userId),
      postTwinMessage: async (conversationId, speakerUserId, content) => {
        await supabaseTwinStore().insertMessage({
          conversation_id: conversationId,
          sender_id: speakerUserId,
          is_ai: true,
          guard_rewritten: false,
          content,
        })
      },
      endConversation: (id, reason, closerUserId) => getConversationApi().endConversation(id, reason, { closerUserId }),
      writeLog,
      schedule: (ms, run) => void setTimeout(run, ms),
      now: () => new Date(),
      seedAutoResponse: CONFIG.SEED_AUTO_RESPONSE,
    })),
  anomaly: getAnomalyApi,
  lobby: () =>
    (lobbyApi ??= createLobbyApi({
      store: supabaseLobbyStore(),
      searchLobby,
      getShareableProfile,
      createTaskFromText,
      createSingleTargetTask,
      startConversation,
      llmJson,
    })),
  notifications: () => (notificationApi ??= createNotificationApi({ store: supabaseNotificationStore(), now: () => new Date() })),
  resolveUserId: resolveAppUserId,
})
