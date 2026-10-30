// C4 聊天室、C5 結果頁路由：登入、對話 id 檢查、錯誤格式 { ok, error }、成員以外 403（chatRoom 用假的）。
import { describe, expect, it, vi } from 'vitest'
import type { Context } from 'hono'
import { ChatRoomError, type ChatRoomApi } from '../../server/twin/chatRoom'
import { createTwinRoutes } from '../../server/routes/twin'
import type { ResultApi } from '../../server/twin/result'

const CONV_ID = '6f1c2a5e-7d1b-4c3a-9e2f-1a2b3c4d5e6f'

function app(opts: { userId?: string | null; api?: Partial<ChatRoomApi>; result?: Partial<ResultApi> } = {}) {
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
  return { routes: createTwinRoutes({ chatRoom: () => api, result: () => result, resolveUserId }), api, result }
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
