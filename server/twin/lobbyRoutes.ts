// C9／C10 大廳路由（掛在 server/routes/twin.ts 底下，例如 GET /api/lobby）。擁有者：C。
// 回應格式：成功 { ok: true, data }，失敗 { ok: false, error: '给用户看的简体中文讯息' }。一律先確認登入。
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { LobbyError, lobbyFilterSchema, questionSchema, QUESTION_MAX, type LobbyApi } from './lobby'

export interface LobbyRouteDeps {
  lobby(): LobbyApi
  /** 回 users.id；失敗回已寫好的 401／403 Response。 */
  resolveUserId(c: Context): Promise<string | Response>
}

const idSchema = z.uuid()
const targetBodySchema = z.object({ targetUserId: idSchema })
const NOT_FOUND = '找不到这位用户'

async function handle<T>(c: Context, deps: LobbyRouteDeps, run: (userId: string) => Promise<T>) {
  const userId = await deps.resolveUserId(c)
  if (userId instanceof Response) return userId
  try {
    return c.json({ ok: true, data: await run(userId) })
  } catch (err) {
    if (err instanceof LobbyError) return c.json({ ok: false, error: err.message }, err.status)
    throw err
  }
}

export function createLobbyRoutes(deps: LobbyRouteDeps): Hono {
  const routes = new Hono()

  // C9 大廳卡片：?purpose=friend|study|sport|hobby&q=關鍵字；沒有分數，只有 AI 預估文字等級
  routes.get('/lobby', (c) =>
    handle(c, deps, (userId) => {
      const filter = lobbyFilterSchema.safeParse({ purpose: c.req.query('purpose') || undefined, q: c.req.query('q') || undefined })
      if (!filter.success) throw new LobbyError('筛选条件不正确')
      return deps.lobby().list(userId, filter.data)
    }),
  )

  // C10 大廳 AI 助手：{ question }；像交辦任務就建任務（回 taskId），否則回答＋候選人小卡片
  routes.post('/lobby/assistant', (c) =>
    handle(c, deps, async (userId) => {
      const body = questionSchema.safeParse(await c.req.json().catch(() => null))
      if (!body.success) throw new LobbyError(`问题要在 1–${QUESTION_MAX} 字之间`)
      return deps.lobby().ask(userId, body.data.question)
    }),
  )

  // C9「让分身去聊」：B 的 createSingleTargetTask，回 taskId
  routes.post('/lobby/:id/twin-chat', (c) =>
    handle(c, deps, (userId) => {
      const id = idSchema.safeParse(c.req.param('id'))
      if (!id.success) throw new LobbyError(NOT_FOUND, 404)
      return deps.lobby().twinChat(userId, id.data)
    }),
  )

  // C9「自己聊」：本人發起對話（07C 第 4 節 POST /api/conversations），{ targetUserId }，回 conversationId
  routes.post('/conversations', (c) =>
    handle(c, deps, async (userId) => {
      const body = targetBodySchema.safeParse(await c.req.json().catch(() => null))
      if (!body.success) throw new LobbyError(NOT_FOUND, 404)
      return deps.lobby().humanChat(userId, body.data.targetUserId)
    }),
  )

  return routes
}
