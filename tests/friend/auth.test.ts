/**
 * A0b：JWT 解析、profile/init 幂等（Supabase 全 mock）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUser = vi.fn()
const maybeSingle = vi.fn()
const insertSingle = vi.fn()

vi.mock('../../server/lib/supabase', () => ({
  getServiceClient: () => ({
    auth: { getUser },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle,
          single: maybeSingle,
        }),
      }),
      insert: () => ({
        select: () => ({
          single: insertSingle,
        }),
      }),
    }),
  }),
  resetServiceClientForTest: () => {},
}))

import { parseBearer, resolveAuthUser } from '../../server/lib/auth'
import { initUserProfile } from '../../server/lib/profile'
import { app } from '../../server/app'

describe('parseBearer', () => {
  it('取出 Bearer token', () => {
    expect(parseBearer('Bearer abc.def')).toBe('abc.def')
  })
  it('大小写不敏感', () => {
    expect(parseBearer('bearer xyz')).toBe('xyz')
  })
  it('缺或格式错回 null', () => {
    expect(parseBearer(undefined)).toBeNull()
    expect(parseBearer('Token abc')).toBeNull()
    expect(parseBearer('Bearer')).toBeNull()
  })
})

describe('resolveAuthUser', () => {
  beforeEach(() => {
    getUser.mockReset()
  })

  it('JWT 有效时回 auth 用户与昵称', async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'a@example.com',
          user_metadata: { display_name: '小望' },
        },
      },
      error: null,
    })
    const u = await resolveAuthUser('fake.jwt')
    expect(u).toEqual({
      authId: '11111111-1111-4111-8111-111111111111',
      email: 'a@example.com',
      displayName: '小望',
    })
  })

  it('JWT 无效回 null', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } })
    expect(await resolveAuthUser('bad')).toBeNull()
  })
})

describe('initUserProfile 幂等', () => {
  const authed = {
    authId: '11111111-1111-4111-8111-111111111111',
    email: 'a@example.com',
    displayName: '小望',
  }

  beforeEach(() => {
    maybeSingle.mockReset()
    insertSingle.mockReset()
  })

  it('已有行时 created=false', async () => {
    maybeSingle.mockResolvedValue({
      data: { id: '22222222-2222-4222-8222-222222222222', display_name: '小望' },
      error: null,
    })
    const r = await initUserProfile(authed)
    expect(r).toEqual({
      userId: '22222222-2222-4222-8222-222222222222',
      displayName: '小望',
      created: false,
    })
    expect(insertSingle).not.toHaveBeenCalled()
  })

  it('没有行时插入并 created=true', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })
    insertSingle.mockResolvedValue({
      data: { id: '33333333-3333-4333-8333-333333333333', display_name: '小望' },
      error: null,
    })
    const r = await initUserProfile(authed)
    expect(r.created).toBe(true)
    expect(r.userId).toBe('33333333-3333-4333-8333-333333333333')
  })
})

describe('POST /api/profile/init', () => {
  beforeEach(() => {
    getUser.mockReset()
    maybeSingle.mockReset()
    insertSingle.mockReset()
  })

  it('无 Authorization 回 401', async () => {
    const res = await app.request('/api/profile/init', { method: 'POST' })
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ ok: false })
  })

  it('有效 JWT 且已有档案回 ok', async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'a@example.com',
          user_metadata: { display_name: '小望' },
        },
      },
      error: null,
    })
    maybeSingle.mockResolvedValue({
      data: { id: '22222222-2222-4222-8222-222222222222', display_name: '小望' },
      error: null,
    })
    const res = await app.request('/api/profile/init', {
      method: 'POST',
      headers: { Authorization: 'Bearer good.jwt' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      ok: true,
      data: { created: false, displayName: '小望' },
    })
  })
})
