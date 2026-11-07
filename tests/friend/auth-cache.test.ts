import { createHash } from 'node:crypto'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  getUser: vi.fn(), query: vi.fn(), from: vi.fn(), hasDb: true,
  updateUserById: vi.fn(), deleteUser: vi.fn(), rowError: null as unknown,
}))

function makeTable() {
  const t = {
    select: vi.fn(() => t), eq: vi.fn(() => t),
    maybeSingle: mock.query, single: mock.query,
    update: vi.fn(() => t), insert: vi.fn(async () => ({ error: null })),
    delete: vi.fn(() => t), or: vi.fn(async () => ({ data: [], error: null })),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({
      data: [{ id: 'app-a', auth_id: 'auth-a', display_name: '测试' }], error: mock.rowError,
    }).then(resolve),
  }
  return t
}

vi.mock('../../server/lib/supabase.js', () => ({
  getServiceClient: () => ({
    auth: { getUser: mock.getUser, admin: { updateUserById: mock.updateUserById, deleteUser: mock.deleteUser } },
    from: mock.from,
  }),
}))
vi.mock('../../server/social/db.js', () => ({ getAdminDb: () => mock.hasDb ? {} : null }))
vi.mock('../../server/lib/llm/index.js', () => ({ llmJson: vi.fn(), llmText: vi.fn(), embed: vi.fn() }))
vi.mock('../../server/lib/adminAuth.js', () => ({ isAdminRequest: () => true }))

import { requireAuth, resolveAuthUser } from '../../server/lib/auth.js'
import { clearAuthCaches, invalidateAuthUser, TtlCache } from '../../server/lib/authCache.js'
import { findAppUserId } from '../../server/lib/appUser.js'
import { friendRoutes } from '../../server/routes/friend.js'
import { twinRoutes } from '../../server/routes/twin.js'
import { adminRoutes } from '../../server/routes/admin.js'
import { DEV_USER_ID, requireUserId } from '../../server/social/user.js'
import { supabaseGuestCleanupDeps } from '../../server/account/guestCleanup.js'

const NOW = 1_800_000_000_000
const user = { id: 'auth-a', email: 'a@example.test', user_metadata: { display_name: '测试' }, app_metadata: {} }
function token(exp: unknown = NOW / 1000 + 600, id = 'a') {
  return `header.${Buffer.from(JSON.stringify({ exp, id })).toString('base64url')}.signature`
}

beforeEach(() => {
  clearAuthCaches()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  mock.getUser.mockReset().mockResolvedValue({ data: { user }, error: null })
  mock.query.mockReset().mockResolvedValue({ data: { id: 'app-a' }, error: null })
  mock.from.mockReset().mockImplementation(makeTable)
  mock.updateUserById.mockReset().mockResolvedValue({ error: null })
  mock.deleteUser.mockReset().mockResolvedValue({ error: null })
  mock.hasDb = true
  mock.rowError = null
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('JWT 验证快取', () => {
  it('同一个有效 JWT 的后续请求复用验证结果', async () => {
    expect(await resolveAuthUser(token())).toMatchObject({ authId: 'auth-a' })
    expect(await resolveAuthUser(token())).toMatchObject({ authId: 'auth-a' })
    expect(mock.getUser).toHaveBeenCalledTimes(1)
  })

  it.each([60_000, 60_001])('达到 60 秒期限（%i ms）重新验证，读取不延长期限', async (ms) => {
    await resolveAuthUser(token())
    vi.setSystemTime(NOW + 59_999)
    await resolveAuthUser(token())
    expect(mock.getUser).toHaveBeenCalledTimes(1)
    vi.setSystemTime(NOW + ms)
    await resolveAuthUser(token())
    expect(mock.getUser).toHaveBeenCalledTimes(2)
  })

  it('exp 提前到期时重新验证，不等 60 秒', async () => {
    const jwt = token(NOW / 1000 + 10)
    await resolveAuthUser(jwt)
    vi.setSystemTime(NOW + 9_999)
    await resolveAuthUser(jwt)
    expect(mock.getUser).toHaveBeenCalledTimes(1)
    vi.setSystemTime(NOW + 10_000)
    await resolveAuthUser(jwt)
    await resolveAuthUser(jwt)
    expect(mock.getUser).toHaveBeenCalledTimes(3)
  })

  it.each([
    { data: { user: null }, error: { message: 'bad token' } },
    { data: { user: null }, error: null },
    { data: { user: { ...user, app_metadata: { banned: true } } }, error: null },
  ])('验证失败、没有用户或 banned 不快取 %#', async (result) => {
    mock.getUser.mockResolvedValue(result)
    const first = await resolveAuthUser(token())
    expect(first).toEqual(result.data.user ? { authId: 'auth-a', email: user.email, displayName: '测试', banned: true } : null)
    await resolveAuthUser(token())
    expect(mock.getUser).toHaveBeenCalledTimes(2)
  })

  it.each(['bad', 'a.!!!.b', 'a.bnVsbA.b', 'a.e30.b', token(null), token('1800000600'), token(NOW / 1000)])(
    '没有可用 exp 的 token 仍交给 getUser，而且不快取：%s', async (jwt) => {
      await resolveAuthUser(jwt)
      await resolveAuthUser(jwt)
      expect(mock.getUser).toHaveBeenCalledTimes(2)
    },
  )

  it('第 501 笔淘汰最早插入的 JWT，命中不改变插入顺序', async () => {
    for (let i = 0; i < 500; i++) await resolveAuthUser(token(undefined, String(i)))
    await resolveAuthUser(token(undefined, '0'))
    await resolveAuthUser(token(undefined, '500'))
    await resolveAuthUser(token(undefined, '1'))
    expect(mock.getUser).toHaveBeenCalledTimes(501)
    await resolveAuthUser(token(undefined, '0'))
    expect(mock.getUser).toHaveBeenCalledTimes(502)
  })

  it('Map 只以 SHA-256 为 key，不保留原始 JWT key', async () => {
    const jwt = token()
    const spy = vi.spyOn(Map.prototype, 'set')
    await resolveAuthUser(jwt)
    const keys = spy.mock.calls.map(([key]) => key)
    expect(keys).toContain(createHash('sha256').update(jwt).digest('hex'))
    expect(keys.some((key) => typeof key === 'string' && key.includes(jwt))).toBe(false)
  })

  it('查询耗时不把快取有效期推到 JWT exp 之后', async () => {
    mock.getUser.mockImplementation(async () => {
      vi.setSystemTime(NOW + 11_000)
      return { data: { user }, error: null }
    })
    const jwt = token(NOW / 1000 + 10)
    await resolveAuthUser(jwt)
    await resolveAuthUser(jwt)
    expect(mock.getUser).toHaveBeenCalledTimes(2)
  })

  it('呼叫端修改回传物件不会污染快取', async () => {
    const first = (await resolveAuthUser(token()))!
    first.authId = 'another-user'
    expect(await resolveAuthUser(token())).toMatchObject({ authId: 'auth-a' })
  })
})

describe('共用 users.id 查询', () => {
  it('同一个 authId 只查一次，达到 5 分钟后重查', async () => {
    expect(await findAppUserId('auth-a')).toBe('app-a')
    vi.setSystemTime(NOW + 299_999)
    expect(await findAppUserId('auth-a')).toBe('app-a')
    expect(mock.query).toHaveBeenCalledTimes(1)
    expect(mock.from).toHaveBeenCalledWith('users')
    vi.setSystemTime(NOW + 300_000)
    await findAppUserId('auth-a')
    expect(mock.query).toHaveBeenCalledTimes(2)
  })

  it('查不到回 null，下一次仍然查 DB', async () => {
    mock.query.mockResolvedValue({ data: null, error: null })
    expect(await findAppUserId('auth-a')).toBeNull()
    expect(await findAppUserId('auth-a')).toBeNull()
    expect(mock.query).toHaveBeenCalledTimes(2)
  })

  it('DB 错误原样 throw，下一次仍然查 DB', async () => {
    const error = { message: 'offline' }
    mock.query.mockResolvedValue({ data: null, error })
    await expect(findAppUserId('auth-a')).rejects.toBe(error)
    await expect(findAppUserId('auth-a')).rejects.toBe(error)
    expect(mock.query).toHaveBeenCalledTimes(2)
  })

  it('users.id 快取同样最多 500 笔', async () => {
    for (let i = 0; i < 501; i++) await findAppUserId(`auth-${i}`)
    await findAppUserId('auth-1')
    expect(mock.query).toHaveBeenCalledTimes(501)
    await findAppUserId('auth-0')
    expect(mock.query).toHaveBeenCalledTimes(502)
  })
})

describe('失效与共用 TTL 容器', () => {
  it('可注入时钟，按插入顺序淘汰，而且到期立即失效', () => {
    let now = 0
    const cache = new TtlCache<string>(2, () => now)
    cache.set('a', 'A', 10)
    cache.set('b', 'B', 20)
    expect(cache.get('a')).toBe('A')
    cache.set('c', 'C', 30)
    expect(cache.get('a')).toBeUndefined()
    now = 20
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('c')).toBe('C')
  })

  it('指定 authId 的全部 JWT 和 users.id 都重查，其他用户不受影响', async () => {
    const a = token(undefined, 'a'), b = token(undefined, 'b'), other = token(undefined, 'other')
    await resolveAuthUser(a)
    await resolveAuthUser(b)
    await findAppUserId('auth-a')
    mock.getUser.mockResolvedValueOnce({ data: { user: { ...user, id: 'auth-other' } }, error: null })
    await resolveAuthUser(other)
    await findAppUserId('auth-other')
    invalidateAuthUser('auth-a')
    await resolveAuthUser(other)
    await findAppUserId('auth-other')
    expect(mock.getUser).toHaveBeenCalledTimes(3)
    expect(mock.query).toHaveBeenCalledTimes(2)
    await resolveAuthUser(a)
    await resolveAuthUser(b)
    await findAppUserId('auth-a')
    expect(mock.getUser).toHaveBeenCalledTimes(5)
    expect(mock.query).toHaveBeenCalledTimes(3)
  })

  it('clearAuthCaches 清除两种快取', async () => {
    await resolveAuthUser(token())
    await findAppUserId('auth-a')
    clearAuthCaches()
    await resolveAuthUser(token())
    await findAppUserId('auth-a')
    expect(mock.getUser).toHaveBeenCalledTimes(2)
    expect(mock.query).toHaveBeenCalledTimes(2)
  })

  it('失效前开始的查询不能在完成后重新填入旧资料', async () => {
    let finishAuth!: (value: unknown) => void, finishId!: (value: unknown) => void
    mock.getUser.mockReturnValueOnce(new Promise((resolve) => { finishAuth = resolve }))
    mock.query.mockReturnValueOnce(new Promise((resolve) => { finishId = resolve }))
    const authPending = resolveAuthUser(token()), idPending = findAppUserId('auth-a')
    invalidateAuthUser('auth-a')
    finishAuth({ data: { user }, error: null })
    finishId({ data: { id: 'app-a' }, error: null })
    await Promise.all([authPending, idPending])
    await resolveAuthUser(token())
    await findAppUserId('auth-a')
    expect(mock.getUser).toHaveBeenCalledTimes(2)
    expect(mock.query).toHaveBeenCalledTimes(2)
  })
})

const headers = () => ({ Authorization: `Bearer ${token()}` })
const social = new Hono().get('/social', async (c) => {
  const id = await requireUserId(c)
  return id instanceof Response ? id : c.json({ id })
})
const missing = { ok: false, error: '找不到你的用户资料，请重新进入一次' }

describe('三个呼叫端保留现有行为', () => {
  it('friend、twin、social 依序请求共用同一份验证和 users.id 快取', async () => {
    // 使用无效业务输入，验证通过后在现有输入检查结束，不触发业务 DB/LLM。
    const friend = await friendRoutes.request('/friend/chat', {
      method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: '{"text":""}',
    })
    expect(friend.status).toBe(400)
    expect(await friend.json()).toEqual({ ok: false, error: '讯息要 1–1000 字' })
    const twin = await twinRoutes.request('/conversations/invalid-id', { headers: headers() })
    expect(twin.status).toBe(404)
    const res = await social.request('/social', { headers: headers() })
    expect(await res.json()).toEqual({ id: 'app-a' })
    expect(mock.getUser).toHaveBeenCalledTimes(1)
    expect(mock.query).toHaveBeenCalledTimes(1)
  })

  it('friend 没有 users 行时 throw，由现有 route catch 回 500', async () => {
    mock.query.mockResolvedValue({ data: null, error: null })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await friendRoutes.request('/friend/intro', { method: 'POST', headers: headers() })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ ok: false, error: '阿澈还没准备好，再试一次？' })
    expect(log.mock.calls[0]?.[1]).toEqual(new Error('找不到用户：no row'))
  })

  it('twin 没有 users 行时回原本的 403 文案', async () => {
    mock.query.mockResolvedValue({ data: null, error: null })
    const res = await twinRoutes.request('/notifications', { headers: headers() })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual(missing)
  })

  it('social 没有 users 行时回原本的 403 文案', async () => {
    mock.query.mockResolvedValue({ data: null, error: null })
    const res = await social.request('/social', { headers: headers() })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual(missing)
  })

  it('social 没有 DB 时仍回 DEV_USER_ID，不验证或查询', async () => {
    mock.hasDb = false
    const res = await social.request('/social')
    expect(await res.json()).toEqual({ id: DEV_USER_ID })
    expect(mock.getUser).not.toHaveBeenCalled()
    expect(mock.query).not.toHaveBeenCalled()
  })

  it('requireAuth 原本的 401 和 banned 403 格式不变', async () => {
    const app = new Hono().get('/', async (c) => {
      const auth = await requireAuth(c)
      return auth instanceof Response ? auth : c.json(auth)
    })
    const absent = await app.request('/')
    expect(absent.status).toBe(401)
    expect(await absent.json()).toEqual({ ok: false, error: '请先登录' })
    mock.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'bad' } })
    const expired = await app.request('/', { headers: headers() })
    expect(expired.status).toBe(401)
    expect(await expired.json()).toEqual({ ok: false, error: '登录已过期，请重新登录' })
    mock.getUser.mockResolvedValueOnce({ data: { user: { ...user, app_metadata: { banned: true } } }, error: null })
    const banned = await app.request('/', { headers: headers() })
    expect(banned.status).toBe(403)
    expect(await banned.json()).toEqual({ ok: false, code: 'banned', error: '这个帐号已被停用。如有疑问请联系我们' })
  })
})

describe('管理与删除成功后的失效', () => {
  async function warm() { await resolveAuthUser(token()); await findAppUserId('auth-a') }
  async function expectReload() {
    const beforeAuth = mock.getUser.mock.calls.length, beforeId = mock.query.mock.calls.length
    await warm()
    expect(mock.getUser).toHaveBeenCalledTimes(beforeAuth + 1)
    expect(mock.query).toHaveBeenCalledTimes(beforeId + 1)
  }

  it.each([true, false])('管理员停用或恢复成功（banned=%s）后清除两种快取', async (banned) => {
    await warm()
    const res = await adminRoutes.request('/admin/ban', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: '11111111-1111-4111-8111-111111111111', banned }),
    })
    expect(res.status).toBe(200)
    await expectReload()
  })

  it('管理员更新失败时保留快取', async () => {
    await warm()
    mock.updateUserById.mockResolvedValue({ error: new Error('update failed') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await adminRoutes.request('/admin/ban', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: '11111111-1111-4111-8111-111111111111', banned: true }),
    })
    expect(res.status).toBe(500)
    await warm()
    expect(mock.getUser).toHaveBeenCalledTimes(1)
    expect(mock.query).toHaveBeenCalledTimes(1)
  })

  it('游客 Auth 删除成功（users cascade）后清除两种快取', async () => {
    await warm()
    await supabaseGuestCleanupDeps().deleteGuest('auth-a')
    expect(mock.deleteUser).toHaveBeenCalledWith('auth-a')
    await expectReload()
  })

  it('游客删除失败时不清除已验证资料', async () => {
    await warm()
    const error = new Error('delete failed')
    mock.deleteUser.mockResolvedValue({ error })
    await expect(supabaseGuestCleanupDeps().deleteGuest('auth-a')).rejects.toBe(error)
    await resolveAuthUser(token())
    expect(mock.getUser).toHaveBeenCalledTimes(1)
  })
})
