// C 線的 API 路由，掛在 /api 底下（例如 twinRoutes.get('/xxx') → GET /api/xxx）。擁有者：C。
// 回應格式：成功 { ok: true, data }，失敗 { ok: false, error: '给用户看的简体中文讯息' }。
// 所有 /conversations/:id/* 先確認呼叫者是這段對話的一方，否則 403（07C 第 4 節）。
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { isAuthFailure, requireAuth } from '../lib/auth'
import { writeLog } from '../lib/log'
import { getServiceClient } from '../lib/supabase'
import { ChatRoomError, createChatRoomApi, MESSAGE_MAX, messageBodySchema, type ChatRoomApi } from '../twin/chatRoom'
import { supabaseChatRoomStore } from '../twin/chatRoomStore'
import { twinReply } from '../twin/twin'

/** 回 users.id；失敗回已寫好的 401／403 Response。 */
export type ResolveUserId = (c: Context) => Promise<string | Response>

export interface TwinRouteDeps {
  chatRoom(): ChatRoomApi
  resolveUserId: ResolveUserId
}

const idSchema = z.uuid()

/** Bearer JWT → auth 用戶 → users.id。 */
async function resolveAppUserId(c: Context): Promise<string | Response> {
  const authed = await requireAuth(c)
  if (isAuthFailure(authed)) return authed
  const { data, error } = await getServiceClient().from('users').select('id').eq('auth_id', authed.authId).maybeSingle()
  if (error) throw new Error(`读取用户失败：${error.message}`)
  if (!data) return c.json({ ok: false, error: '找不到你的用户资料，请重新进入一次' }, 403)
  return data.id as string
}

/** 先確認登入與對話 id，再執行 run；ChatRoomError 原樣回給用戶，其他錯誤交給 app.onError。 */
async function respond<T>(c: Context, deps: TwinRouteDeps, run: (api: ChatRoomApi, id: string, userId: string) => Promise<T>) {
  const userId = await deps.resolveUserId(c)
  if (userId instanceof Response) return userId
  const id = idSchema.safeParse(c.req.param('id'))
  if (!id.success) return c.json({ ok: false, error: '找不到这段对话' }, 404)
  try {
    return c.json({ ok: true, data: await run(deps.chatRoom(), id.data, userId) })
  } catch (err) {
    if (err instanceof ChatRoomError) return c.json({ ok: false, error: err.message }, err.status)
    throw err
  }
}

export function createTwinRoutes(deps: TwinRouteDeps): Hono {
  const routes = new Hono()

  // C4 聊天室：雙方是誰、誰在聊、完整訊息
  routes.get('/conversations/:id', (c) => respond(c, deps, (api, id, userId) => api.getChatRoom(id, userId)))

  // C4 目前判定：只有我方視角的判定與走勢，沒有數字
  routes.get('/conversations/:id/status', (c) => respond(c, deps, (api, id, userId) => api.getChatStatus(id, userId)))

  // C4 本人發言：{ text }（1–1000 字）；對方是分身且對話進行中就讓它回覆
  routes.post('/conversations/:id/messages', async (c) => {
    const body = messageBodySchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ ok: false, error: `消息要在 1–${MESSAGE_MAX} 字之间` }, 400)
    return respond(c, deps, (api, id, userId) => api.sendHumanMessage(id, userId, body.data.text))
  })

  return routes
}

let chatRoomApi: ChatRoomApi | null = null

export const twinRoutes = createTwinRoutes({
  chatRoom: () => (chatRoomApi ??= createChatRoomApi({ store: supabaseChatRoomStore(), twinReply, writeLog })),
  resolveUserId: resolveAppUserId,
})
