import { describe, expect, it } from 'vitest'
import { nameLogin, type NameLoginDeps } from '../../server/account/nameLogin'

function fakeDeps(accounts: Record<string, { authId: string; email: string | null }>, reserved: string[] = []) {
  const calls = { setEmail: [] as string[], issued: [] as string[], created: [] as string[], profiles: [] as string[] }
  let n = 0
  const deps: NameLoginDeps = {
    async findAccount(name) {
      return accounts[name] ?? null
    },
    async isReservedName(name) {
      return reserved.includes(name)
    },
    async setEmail(authId, email) {
      calls.setEmail.push(`${authId}:${email}`)
    },
    async createAccount(email, displayName) {
      calls.created.push(displayName)
      return `auth-${++n}`
    },
    async issueLogin(email) {
      calls.issued.push(email)
      return { tokenHash: `hash-${email}`, verificationType: 'magiclink' }
    },
    async ensureProfile(_authId, _email, name) {
      calls.profiles.push(name)
      accounts[name] = { authId: _authId, email: _email }
    },
  }
  return { deps, calls }
}

describe('名字帳號', () => {
  it('新名字直接建立帳號', async () => {
    const { deps, calls } = fakeDeps({})
    const r = await nameLogin({ mode: 'name', name: ' 小明 ' }, deps)
    expect(r).toMatchObject({ ok: true, displayName: '小明', created: true })
    expect(calls.created).toEqual(['小明'])
    expect(calls.profiles).toEqual(['小明'])
    expect(calls.issued).toHaveLength(1)
  })

  it('名字已有帳號：先提示重複，不登入', async () => {
    const { deps, calls } = fakeDeps({ 小明: { authId: 'a1', email: 'x@users.personaai.app' } })
    const r = await nameLogin({ mode: 'name', name: '小明' }, deps)
    expect(r).toMatchObject({ ok: false, code: 'exists', displayName: '小明' })
    expect(calls.issued).toEqual([])
  })

  it('確認是本人：回到同一個帳號，舊匿名帳號會補 email', async () => {
    const { deps, calls } = fakeDeps({ 小明: { authId: 'a1', email: null } })
    const r = await nameLogin({ mode: 'name', name: '小明', confirmExisting: true }, deps)
    expect(r).toMatchObject({ ok: true, created: false })
    expect(calls.setEmail).toEqual(['a1:a1@users.personaai.app'])
    expect(calls.issued).toEqual(['a1@users.personaai.app'])
    expect(calls.created).toEqual([])
    expect(calls.profiles).toEqual([])
  })

  it('種子用戶的名字不能用、名字長度要合法', async () => {
    const { deps } = fakeDeps({}, ['小安'])
    expect(await nameLogin({ mode: 'name', name: '小安', confirmExisting: true }, deps)).toMatchObject({ code: 'reserved' })
    expect(await nameLogin({ mode: 'name', name: '  ' }, deps)).toMatchObject({ code: 'invalid' })
    expect(await nameLogin({ mode: 'name', name: '字'.repeat(21) }, deps)).toMatchObject({ code: 'invalid' })
  })

  it('隨機名字一定不和現有帳號重複', async () => {
    const { deps } = fakeDeps({ 星星: { authId: 'a1', email: 'e' } }, ['月亮'])
    const r = await nameLogin({ mode: 'random', name: '星星' }, deps)
    expect(r.ok).toBe(true)
    if (r.ok) expect(['星星', '月亮']).not.toContain(r.displayName)
  })

  it('隨機名字全被用掉時加數字', async () => {
    const taken = new Proxy({} as Record<string, { authId: string; email: string }>, {
      get: (_t, key) => (typeof key === 'string' && !/\d$/.test(key) ? { authId: 'x', email: 'e' } : undefined),
    })
    const { deps } = fakeDeps(taken)
    const r = await nameLogin({ mode: 'random', name: '星星' }, deps)
    expect(r.ok && /\d$/.test(r.displayName)).toBe(true)
  })
})
