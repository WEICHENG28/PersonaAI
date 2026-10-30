import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'

// 假的 A0b 驗證與資料庫：只測「token → auth_id → users.id」這段對應
const authMock = vi.hoisted(() => ({ result: null as unknown }))
const dbMock = vi.hoisted(() => ({ db: null as unknown }))

vi.mock('../../server/lib/auth', () => ({
  requireAuth: async () => authMock.result,
  isAuthFailure: (v: unknown) => v instanceof Response,
}))
vi.mock('../../server/social/db', () => ({ getAdminDb: () => dbMock.db }))

const { requireUserId, DEV_USER_ID } = await import('../../server/social/user')

function fakeDb(row: { id: string } | null) {
  const eq = vi.fn(() => ({ maybeSingle: async () => ({ data: row, error: null }) }))
  return { db: { from: () => ({ select: () => ({ eq }) }) }, eq }
}

/** 用一個小 app 呼叫 requireUserId，回傳 users.id 或錯誤回應。 */
async function call() {
  const app = new Hono().get('/t', async (c) => {
    const id = await requireUserId(c)
    return id instanceof Response ? id : c.json({ id })
  })
  const res = await app.request('/t')
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

afterEach(() => {
  authMock.result = null
  dbMock.db = null
})

describe('requireUserId', () => {
  it('沒接資料庫時是 dev 用戶', async () => {
    expect(await call()).toEqual({ status: 200, body: { id: DEV_USER_ID } })
  })

  it('用 auth_id 查出 users.id', async () => {
    const { db, eq } = fakeDb({ id: 'user-123' })
    dbMock.db = db
    authMock.result = { authId: 'auth-abc', email: '', displayName: '小鹿' }
    expect(await call()).toEqual({ status: 200, body: { id: 'user-123' } })
    expect(eq).toHaveBeenCalledWith('auth_id', 'auth-abc')
  })

  it('沒登入時直接回 A 的 401', async () => {
    dbMock.db = fakeDb(null).db
    authMock.result = new Response(JSON.stringify({ ok: false, error: '请先登录' }), { status: 401 })
    expect((await call()).status).toBe(401)
  })

  it('登入了但 users 沒有資料時回 403 與中文提示', async () => {
    dbMock.db = fakeDb(null).db
    authMock.result = { authId: 'auth-abc', email: '', displayName: '小鹿' }
    expect(await call()).toEqual({ status: 403, body: { ok: false, error: '找不到你的用户资料，请重新进入一次' } })
  })
})
