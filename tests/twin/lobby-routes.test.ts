// C9／C10 大廳路由：登入、查詢與 body 驗證、錯誤格式 { ok, error }（大廳邏輯用假的）。
import { describe, expect, it, vi } from 'vitest'
import type { Context } from 'hono'
import { createTwinRoutes, type TwinRouteDeps } from '../../server/routes/twin'
import { ChatRoomError } from '../../server/twin/chatRoom'
import type { LobbyApi, LobbyCardView } from '../../server/twin/lobby'

const TARGET = '22222222-2222-4222-8222-222222222222'
const CARD: LobbyCardView = {
  userId: TARGET,
  name: '小安',
  headline: '慢热的登山爱好者',
  tags: ['登山'],
  chatStyle: '慢热、短句',
  mbti: null,
  fit: 'likely',
}

function app(opts: { userId?: string | null; lobby?: Partial<LobbyApi> } = {}) {
  const lobby: LobbyApi = {
    listLobby: vi.fn(async () => [CARD]),
    ask: vi.fn(async () => ({ kind: 'answer' as const, answer: '小安也爱登山。', cards: [{ ...CARD, fit: null }] })),
    startHumanChat: vi.fn(async () => ({ conversationId: 'conv-1' })),
    startTwinChat: vi.fn(async () => ({ taskId: 'task-1' })),
    ...opts.lobby,
  }
  const resolveUserId = async (c: Context) =>
    opts.userId === null ? c.json({ ok: false, error: '请先登录' }, 401) : (opts.userId ?? 'user-me')
  const unused = () => {
    throw new Error('大廳路由不該用到')
  }
  const deps: TwinRouteDeps = {
    chatRoom: unused,
    result: unused,
    handoff: unused,
    requestHuman: unused,
    notifications: unused,
    anomaly: unused,
    lobby: () => lobby,
    resolveUserId,
  }
  return { routes: createTwinRoutes(deps), lobby }
}

const post = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('GET /lobby', () => {
  it('沒登入 → 401，不讀大廳', async () => {
    const { routes, lobby } = app({ userId: null })
    expect((await routes.request('/lobby')).status).toBe(401)
    expect(lobby.listLobby).not.toHaveBeenCalled()
  })

  it('篩選條件交給大廳；成功回 { ok, data }', async () => {
    const { routes, lobby } = app()
    const res = await routes.request(`/lobby?purpose=sport&q=${encodeURIComponent('登山')}`)
    expect(await res.json()).toEqual({ ok: true, data: [CARD] })
    expect(lobby.listLobby).toHaveBeenCalledWith('user-me', { purpose: 'sport', q: '登山' })
  })

  it('目的不合法 → 400', async () => {
    const res = await app().routes.request('/lobby?purpose=dating')
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ ok: false })
  })
})

describe('POST /conversations（我自己聊）', () => {
  it('成功回 conversationId', async () => {
    const { routes, lobby } = app()
    const res = await routes.request('/conversations', post({ targetUserId: TARGET }))
    expect(await res.json()).toEqual({ ok: true, data: { conversationId: 'conv-1' } })
    expect(lobby.startHumanChat).toHaveBeenCalledWith('user-me', TARGET)
  })

  it('targetUserId 不是 uuid → 400；沒登入 → 401（內容不對也一樣）', async () => {
    const { routes, lobby } = app()
    expect((await routes.request('/conversations', post({ targetUserId: 'x' }))).status).toBe(400)
    expect((await app({ userId: null }).routes.request('/conversations', post({}))).status).toBe(401)
    expect(lobby.startHumanChat).not.toHaveBeenCalled()
  })

  it('大廳丟出的 ChatRoomError 原樣回給用戶', async () => {
    const { routes } = app({
      lobby: {
        startHumanChat: async () => {
          throw new ChatRoomError('这位用户目前不在大厅里', 404)
        },
      },
    })
    const res = await routes.request('/conversations', post({ targetUserId: TARGET }))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ ok: false, error: '这位用户目前不在大厅里' })
  })
})

describe('POST /lobby/twin-chat（讓分身去聊）', () => {
  it('成功回 taskId', async () => {
    const { routes, lobby } = app()
    const res = await routes.request('/lobby/twin-chat', post({ targetUserId: TARGET }))
    expect(await res.json()).toEqual({ ok: true, data: { taskId: 'task-1' } })
    expect(lobby.startTwinChat).toHaveBeenCalledWith('user-me', TARGET)
  })
})

describe('POST /lobby/assistant（大廳 AI 助手）', () => {
  it('成功回答＋小卡片', async () => {
    const { routes, lobby } = app()
    const res = await routes.request('/lobby/assistant', post({ question: '谁适合一起爬山？' }))
    expect(await res.json()).toEqual({ ok: true, data: { kind: 'answer', answer: '小安也爱登山。', cards: [{ ...CARD, fit: null }] } })
    expect(lobby.ask).toHaveBeenCalledWith('user-me', '谁适合一起爬山？')
  })

  it('問題空白或超過 200 字 → 400；沒登入 → 401', async () => {
    const { routes, lobby } = app()
    expect((await routes.request('/lobby/assistant', post({ question: '  ' }))).status).toBe(400)
    expect((await routes.request('/lobby/assistant', post({ question: '问'.repeat(201) }))).status).toBe(400)
    expect((await app({ userId: null }).routes.request('/lobby/assistant', post({ question: '你好' }))).status).toBe(401)
    expect(lobby.ask).not.toHaveBeenCalled()
  })
})
