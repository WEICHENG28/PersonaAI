// C4 聊天室、C5 結果頁、C6 本人接手、C7 請求真人與通知路由：登入、對話 id 檢查、錯誤格式 { ok, error }、成員以外 403（chatRoom 用假的）。
import { describe, expect, it, vi } from 'vitest'
import type { Context } from 'hono'
import { ChatRoomError, type ChatRoomApi } from '../../server/twin/chatRoom'
import { createTwinRoutes } from '../../server/routes/twin'
import type { ResultApi } from '../../server/twin/result'
import type { HandoffApi, TakeoverView } from '../../server/twin/handoff'
import type { RequestHumanApi } from '../../server/twin/requestHuman'
import type { NotificationApi } from '../../server/twin/notifications'

const CONV_ID = '6f1c2a5e-7d1b-4c3a-9e2f-1a2b3c4d5e6f'
const NOTE_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'

const TAKEOVER: TakeoverView = {
  conversationId: CONV_ID,
  verdict: { value: 'suitable', trend: 'up' },
  summary: { key_points: [], other_highlights: [], twin_said: ['分身已经替你说过：喜欢登山'], open_topics: [], suggested_replies: [] },
  summaryFailed: false,
}

interface AppOpts {
  userId?: string | null
  api?: Partial<ChatRoomApi>
  result?: Partial<ResultApi>
  handoff?: Partial<HandoffApi>
  requestHuman?: Partial<RequestHumanApi>
  notifications?: Partial<NotificationApi>
}

function app(opts: AppOpts = {}) {
  const api: ChatRoomApi = {
    getChatRoom: vi.fn(async () => {
      throw new ChatRoomError('你不是这段对话的成员，不能查看', 403)
    }),
    getChatStatus: vi.fn(async () => ({ status: 'active' as const, myController: 'twin' as const, otherController: 'twin' as const, verdict: null })),
    sendHumanMessage: vi.fn(),
    ...opts.api,
  }
  const resolveUserId = async (c: Context) =>
    opts.userId === null ? c.json({ ok: false, error: '请先登录' }, 401) : (opts.userId ?? 'user-me')
  const result: ResultApi = {
    getResult: vi.fn(async () => {
      throw new ChatRoomError('你不是这段对话的成员，不能查看', 403)
    }),
    continueTwin: vi.fn(async () => ({ roundCount: 12, ended: false })),
    ...opts.result,
  }
  const handoff: HandoffApi = { takeOver: vi.fn(async () => TAKEOVER), ...opts.handoff }
  const requestHuman: RequestHumanApi = {
    requestHuman: vi.fn(async () => ({ notificationId: NOTE_ID })),
    respond: vi.fn(async (_id: string, _u: string, response) => ({ response, conversationId: CONV_ID, handoff: null })),
    ...opts.requestHuman,
  }
  const notifications: NotificationApi = { list: vi.fn(async () => []), markRead: vi.fn(async () => undefined), ...opts.notifications }
  const routes = createTwinRoutes({
    chatRoom: () => api,
    result: () => result,
    handoff: () => handoff,
    requestHuman: () => requestHuman,
    notifications: () => notifications,
    resolveUserId,
  })
  return { routes, api, result, handoff, requestHuman, notifications }
}

describe('twin 路由', () => {
  it('沒登入 → 401', async () => {
    const res = await app({ userId: null }).routes.request(`/conversations/${CONV_ID}/status`)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false, error: '请先登录' })
  })

  it('不是成員 → 403，錯誤是簡體訊息', async () => {
    const res = await app().routes.request(`/conversations/${CONV_ID}`)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ ok: false, error: '你不是这段对话的成员，不能查看' })
  })

  it('對話 id 不是 uuid → 404，不查資料庫', async () => {
    const { routes, api } = app()
    const res = await routes.request('/conversations/lin/status')
    expect(res.status).toBe(404)
    expect(api.getChatStatus).not.toHaveBeenCalled()
  })

  it('成功 → { ok: true, data }，帶目前登入者', async () => {
    const { routes, api } = app()
    const res = await routes.request(`/conversations/${CONV_ID}/status`)
    expect(await res.json()).toEqual({
      ok: true,
      data: { status: 'active', myController: 'twin', otherController: 'twin', verdict: null },
    })
    expect(api.getChatStatus).toHaveBeenCalledWith(CONV_ID, 'user-me')
  })

  it('發言：text 空白或超過 1000 字 → 400', async () => {
    const { routes, api } = app()
    for (const text of ['  ', 'a'.repeat(1001)]) {
      const res = await routes.request(`/conversations/${CONV_ID}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      expect(res.status).toBe(400)
    }
    expect(api.sendHumanMessage).not.toHaveBeenCalled()
  })

  it('發言：去掉前後空白後交給 sendHumanMessage', async () => {
    const send = vi.fn(async () => ({ message: { id: 'h1' }, replied: true, replyFailed: false }))
    const { routes } = app({ api: { sendHumanMessage: send as unknown as ChatRoomApi['sendHumanMessage'] } })
    const res = await routes.request(`/conversations/${CONV_ID}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: ' 嗨 ' }),
    })
    expect(res.status).toBe(200)
    expect(send).toHaveBeenCalledWith(CONV_ID, 'user-me', '嗨')
  })
})

describe('twin 路由：C5 結果頁', () => {
  it('結果頁：不是成員 → 403；id 不是 uuid → 404', async () => {
    const { routes, result } = app()
    expect((await routes.request(`/conversations/${CONV_ID}/result`)).status).toBe(403)
    expect((await routes.request('/conversations/lin/result')).status).toBe(404)
    expect(result.getResult).toHaveBeenCalledTimes(1)
  })

  it('結果頁：沒登入 → 401，不查資料', async () => {
    const { routes, result } = app({ userId: null })
    expect((await routes.request(`/conversations/${CONV_ID}/result`)).status).toBe(401)
    expect(result.getResult).not.toHaveBeenCalled()
  })

  it('讓分身繼續聊：POST 成功回 { ok, data }，帶目前登入者', async () => {
    const { routes, result } = app()
    const res = await routes.request(`/conversations/${CONV_ID}/continue`, { method: 'POST' })
    expect(await res.json()).toEqual({ ok: true, data: { roundCount: 12, ended: false } })
    expect(result.continueTwin).toHaveBeenCalledWith(CONV_ID, 'user-me')
  })

  it('讓分身繼續聊：不能繼續 → 409，錯誤是簡體訊息', async () => {
    const { routes } = app({
      result: {
        continueTwin: vi.fn(async () => {
          throw new ChatRoomError('这段对话已经结束了', 409)
        }),
      },
    })
    const res = await routes.request(`/conversations/${CONV_ID}/continue`, { method: 'POST' })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ ok: false, error: '这段对话已经结束了' })
  })
})

describe('twin 路由：C6 本人接手', () => {
  it('POST 成功回 { ok, data }（接手卡片），帶目前登入者', async () => {
    const { routes, handoff } = app()
    const res = await routes.request(`/conversations/${CONV_ID}/takeover`, { method: 'POST' })
    expect(await res.json()).toEqual({ ok: true, data: TAKEOVER })
    expect(handoff.takeOver).toHaveBeenCalledWith(CONV_ID, 'user-me')
  })

  it('沒登入 → 401；id 不是 uuid → 404；都不接手', async () => {
    const noAuth = app({ userId: null })
    expect((await noAuth.routes.request(`/conversations/${CONV_ID}/takeover`, { method: 'POST' })).status).toBe(401)
    expect(noAuth.handoff.takeOver).not.toHaveBeenCalled()
    const bad = app()
    expect((await bad.routes.request('/conversations/lin/takeover', { method: 'POST' })).status).toBe(404)
    expect(bad.handoff.takeOver).not.toHaveBeenCalled()
  })

  it('不是成員 → 403；已經接手 → 409，錯誤是簡體訊息', async () => {
    for (const [message, status] of [
      ['你不是这段对话的成员，不能查看', 403],
      ['你已经本人接手了，直接在聊天室里聊吧', 409],
    ] as const) {
      const { routes } = app({
        handoff: {
          takeOver: vi.fn(async () => {
            throw new ChatRoomError(message, status)
          }),
        },
      })
      const res = await routes.request(`/conversations/${CONV_ID}/takeover`, { method: 'POST' })
      expect(res.status).toBe(status)
      expect(await res.json()).toEqual({ ok: false, error: message })
    }
  })
})

describe('twin 路由：C7 請求真人與通知', () => {
  const post = (body?: unknown) => ({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  it('請求真人：成功回 { ok, data }，帶目前登入者', async () => {
    const { routes, requestHuman } = app()
    const res = await routes.request(`/conversations/${CONV_ID}/request-human`, { method: 'POST' })
    expect(await res.json()).toEqual({ ok: true, data: { notificationId: NOTE_ID } })
    expect(requestHuman.requestHuman).toHaveBeenCalledWith(CONV_ID, 'user-me')
  })

  it('請求真人：沒登入 401、id 不是 uuid 404、已經請求過 409', async () => {
    expect((await app({ userId: null }).routes.request(`/conversations/${CONV_ID}/request-human`, { method: 'POST' })).status).toBe(401)
    expect((await app().routes.request('/conversations/lin/request-human', { method: 'POST' })).status).toBe(404)
    const busy = app({
      requestHuman: {
        requestHuman: vi.fn(async () => {
          throw new ChatRoomError('已经请求过了，等对方回应', 409)
        }),
      },
    })
    const res = await busy.routes.request(`/conversations/${CONV_ID}/request-human`, { method: 'POST' })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ ok: false, error: '已经请求过了，等对方回应' })
  })

  it('回應：response 不是 now／later／decline → 400，不呼叫', async () => {
    const { routes, requestHuman } = app()
    for (const body of [undefined, {}, { response: 'maybe' }]) {
      const res = await routes.request(`/notifications/${NOTE_ID}/respond`, post(body))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ ok: false, error: '请选择现在聊、稍后聊或拒绝' })
    }
    expect(requestHuman.respond).not.toHaveBeenCalled()
  })

  it('回應：成功回 { ok, data }；通知 id 不是 uuid → 404「找不到这则通知」', async () => {
    const { routes, requestHuman } = app()
    const res = await routes.request(`/notifications/${NOTE_ID}/respond`, post({ response: 'later' }))
    expect(await res.json()).toEqual({ ok: true, data: { response: 'later', conversationId: CONV_ID, handoff: null } })
    expect(requestHuman.respond).toHaveBeenCalledWith(NOTE_ID, 'user-me', 'later')
    const bad = await routes.request('/notifications/abc/respond', post({ response: 'now' }))
    expect(bad.status).toBe(404)
    expect(await bad.json()).toEqual({ ok: false, error: '找不到这则通知' })
  })

  it('通知列表：沒登入 401；成功回自己的通知', async () => {
    expect((await app({ userId: null }).routes.request('/notifications')).status).toBe(401)
    const { routes, notifications } = app()
    const res = await routes.request('/notifications')
    expect(await res.json()).toEqual({ ok: true, data: [] })
    expect(notifications.list).toHaveBeenCalledWith('user-me')
  })

  it('設為已讀：成功回 { ok, data: { id } }', async () => {
    const { routes, notifications } = app()
    const res = await routes.request(`/notifications/${NOTE_ID}/read`, { method: 'POST' })
    expect(await res.json()).toEqual({ ok: true, data: { id: NOTE_ID } })
    expect(notifications.markRead).toHaveBeenCalledWith(NOTE_ID, 'user-me')
  })
})
