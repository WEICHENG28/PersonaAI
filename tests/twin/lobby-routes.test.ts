// C9／C10 大廳路由：登入、參數檢查、錯誤格式 { ok, error }（大廳邏輯用假的）。
import { describe, expect, it, vi } from 'vitest'
import type { Context } from 'hono'
import { LobbyError, type LobbyApi } from '../../server/twin/lobby'
import { createLobbyRoutes } from '../../server/twin/lobbyRoutes'

const TARGET = '6f1c2a5e-7d1b-4c3a-9e2f-1a2b3c4d5e6f'

function app(opts: { userId?: string | null; lobby?: Partial<LobbyApi> } = {}) {
  const lobby: LobbyApi = {
    list: vi.fn(async () => []),
    ask: vi.fn(async () => ({ kind: 'answer' as const, answer: '小安很适合', cards: [] })),
    twinChat: vi.fn(async () => ({ taskId: 'task-1' })),
    humanChat: vi.fn(async () => ({ conversationId: 'conv-1' })),
    ...opts.lobby,
  }
  const resolveUserId = async (c: Context) =>
    opts.userId === null ? c.json({ ok: false, error: '请先登录' }, 401) : (opts.userId ?? 'user-me')
  return { routes: createLobbyRoutes({ lobby: () => lobby, resolveUserId }), lobby }
}

const post = (path: string, body?: unknown) =>
  new Request(`http://x${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })

describe('大廳路由', () => {
  it('沒登入 → 401，四個路由都不執行', async () => {
    const { routes, lobby } = app({ userId: null })
    const responses = await Promise.all([
      routes.request('/lobby'),
      routes.request(post('/lobby/assistant', { question: '谁适合我' })),
      routes.request(post(`/lobby/${TARGET}/twin-chat`)),
      routes.request(post('/conversations', { targetUserId: TARGET })),
    ])
    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401])
    expect(Object.values(lobby).every((fn) => (fn as ReturnType<typeof vi.fn>).mock.calls.length === 0)).toBe(true)
  })

  it('GET /lobby 帶篩選；目的不對 → 400', async () => {
    const { routes, lobby } = app()
    const ok = await routes.request('/lobby?purpose=sport&q=登山')
    expect(await ok.json()).toEqual({ ok: true, data: [] })
    expect(lobby.list).toHaveBeenCalledWith('user-me', { purpose: 'sport', q: '登山' })
    const bad = await routes.request('/lobby?purpose=dating')
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ ok: false, error: '筛选条件不正确' })
  })

  it('POST /lobby/assistant：空問題 → 400；成功回 data', async () => {
    const { routes, lobby } = app()
    expect((await routes.request(post('/lobby/assistant', { question: '  ' }))).status).toBe(400)
    const res = await routes.request(post('/lobby/assistant', { question: '谁适合我' }))
    expect(await res.json()).toEqual({ ok: true, data: { kind: 'answer', answer: '小安很适合', cards: [] } })
    expect(lobby.ask).toHaveBeenCalledWith('user-me', '谁适合我')
  })

  it('POST /lobby/:id/twin-chat：id 不是 uuid → 404；成功回 taskId', async () => {
    const { routes, lobby } = app()
    expect((await routes.request(post('/lobby/lin/twin-chat'))).status).toBe(404)
    const res = await routes.request(post(`/lobby/${TARGET}/twin-chat`))
    expect(await res.json()).toEqual({ ok: true, data: { taskId: 'task-1' } })
    expect(lobby.twinChat).toHaveBeenCalledWith('user-me', TARGET)
  })

  it('POST /conversations：沒有 targetUserId → 404；成功回 conversationId', async () => {
    const { routes, lobby } = app()
    expect((await routes.request(post('/conversations', {}))).status).toBe(404)
    const res = await routes.request(post('/conversations', { targetUserId: TARGET }))
    expect(await res.json()).toEqual({ ok: true, data: { conversationId: 'conv-1' } })
    expect(lobby.humanChat).toHaveBeenCalledWith('user-me', TARGET)
  })

  it('LobbyError 照狀態碼與簡體訊息回給用戶', async () => {
    const { routes } = app({ lobby: { twinChat: vi.fn(async () => Promise.reject(new LobbyError('先开启社交 Agent', 403))) } })
    const res = await routes.request(post(`/lobby/${TARGET}/twin-chat`))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ ok: false, error: '先开启社交 Agent' })
  })
})
