import { describe, expect, it } from 'vitest'
import {
  enterAsGuest,
  loginAccount,
  registerAccount,
  setAccountPassword,
  type AccountDeps,
  type AccountInfo,
} from '../../server/account/nameLogin'

type Stored = AccountInfo & { password?: string; name: string }

function fakeDeps(initial: Stored[] = [], reserved: string[] = []) {
  const accounts = [...initial]
  const calls = { issued: [] as string[], created: [] as string[], upgraded: [] as string[] }
  let n = 0
  const byName = (name: string) => accounts.find((a) => a.name === name) ?? null
  const deps: AccountDeps = {
    async findAccount(name) {
      return byName(name)
    },
    async getAccount(authId) {
      return accounts.find((a) => a.authId === authId) ?? null
    },
    async isReservedName(name) {
      return reserved.includes(name)
    },
    async createAccount(email, name, opts) {
      const authId = `auth-${++n}`
      calls.created.push(name)
      accounts.push({ authId, email, name, password: opts.password, hasPassword: Boolean(opts.password), guest: Boolean(opts.guest) })
      return authId
    },
    async verifyPassword(email, password) {
      return accounts.some((a) => a.email === email && a.password === password)
    },
    async upgradeAccount(authId, patch) {
      const a = accounts.find((x) => x.authId === authId)!
      calls.upgraded.push(authId)
      Object.assign(a, { password: patch.password, hasPassword: true, guest: false })
      if (patch.email) a.email = patch.email
      if (patch.displayName) a.name = patch.displayName
    },
    async issueLogin(email) {
      calls.issued.push(email)
      return { tokenHash: `hash-${email}`, verificationType: 'magiclink' }
    },
    async ensureProfile() {},
  }
  return { deps, calls, accounts }
}

const mingWithPassword: Stored = { authId: 'a1', email: 'a1@users.personaai.app', name: '小明', password: 'secret1', hasPassword: true, guest: false }

describe('註冊', () => {
  it('新名字＋密碼建立正式帳號並登入', async () => {
    const { deps, calls, accounts } = fakeDeps()
    const r = await registerAccount({ name: ' 小明 ', password: 'secret1' }, deps)
    expect(r).toMatchObject({ ok: true, displayName: '小明', created: true, guest: false })
    expect(calls.issued).toHaveLength(1)
    expect(accounts[0]).toMatchObject({ hasPassword: true, guest: false })
  })

  it('名字已被註冊：不登入、不建立', async () => {
    const { deps, calls } = fakeDeps([mingWithPassword])
    expect(await registerAccount({ name: '小明', password: 'whatever1' }, deps)).toMatchObject({ ok: false, code: 'exists' })
    expect(calls.issued).toEqual([])
    expect(calls.created).toEqual([])
  })

  it('種子用戶名字、名字長度、密碼長度都要合法', async () => {
    const { deps } = fakeDeps([], ['小安'])
    expect(await registerAccount({ name: '小安', password: 'secret1' }, deps)).toMatchObject({ code: 'exists' })
    expect(await registerAccount({ name: '  ', password: 'secret1' }, deps)).toMatchObject({ code: 'invalid' })
    expect(await registerAccount({ name: '字'.repeat(21), password: 'secret1' }, deps)).toMatchObject({ code: 'invalid' })
    expect(await registerAccount({ name: '小华', password: '123' }, deps)).toMatchObject({ code: 'invalid' })
  })
})

describe('登入', () => {
  it('名字＋正確密碼才能進入', async () => {
    const { deps, calls } = fakeDeps([mingWithPassword])
    expect(await loginAccount({ name: '小明', password: 'secret1' }, deps)).toMatchObject({ ok: true, created: false })
    expect(calls.issued).toEqual(['a1@users.personaai.app'])
  })

  it('密碼錯誤：不給登入憑證（原本只要輸入名字就能進別人帳號）', async () => {
    const { deps, calls } = fakeDeps([mingWithPassword])
    expect(await loginAccount({ name: '小明', password: 'guess123' }, deps)).toMatchObject({ ok: false, code: 'wrong_password' })
    expect(calls.issued).toEqual([])
  })

  it('沒有這個名字、或舊帳號還沒設密碼：都不能登入', async () => {
    const { deps, calls } = fakeDeps([{ authId: 'a2', email: null, name: '老王', hasPassword: false, guest: false }])
    expect(await loginAccount({ name: '没人', password: 'secret1' }, deps)).toMatchObject({ code: 'not_found' })
    expect(await loginAccount({ name: '老王', password: 'secret1' }, deps)).toMatchObject({ code: 'no_password' })
    expect(calls.issued).toEqual([])
  })
})

describe('游客', () => {
  it('一鍵進入，名字不和現有帳號重複，標記為游客', async () => {
    const { deps, accounts } = fakeDeps([mingWithPassword], ['月亮'])
    const r = await enterAsGuest({ name: '小明' }, deps)
    expect(r).toMatchObject({ ok: true, guest: true, created: true })
    if (r.ok) expect(['小明', '月亮']).not.toContain(r.displayName)
    expect(accounts[1]).toMatchObject({ guest: true, hasPassword: false })
  })

  it('游客設名字＋密碼變成正式帳號，之後能用名字＋密碼登入', async () => {
    const { deps } = fakeDeps()
    const g = await enterAsGuest({ name: '星星' }, deps)
    expect(g.ok).toBe(true)
    const up = await setAccountPassword('auth-1', { password: 'mypass1', name: '阿星' }, deps)
    expect(up).toEqual({ ok: true, displayName: '阿星' })
    expect(await loginAccount({ name: '阿星', password: 'mypass1' }, deps)).toMatchObject({ ok: true, guest: false })
  })

  it('游客換的名字已經有人用：不能換', async () => {
    const { deps } = fakeDeps([mingWithPassword])
    await enterAsGuest({ name: '星星' }, deps)
    expect(await setAccountPassword('auth-1', { password: 'mypass1', name: '小明' }, deps)).toMatchObject({ ok: false, code: 'exists' })
  })
})

describe('設定密碼', () => {
  it('舊的只有名字的帳號：補 email＋設密碼後可以登入', async () => {
    const { deps, accounts } = fakeDeps([{ authId: 'a2', email: null, name: '老王', hasPassword: false, guest: false }])
    expect(await setAccountPassword('a2', { password: 'wang123' }, deps)).toMatchObject({ ok: true })
    expect(accounts[0].email).toBe('a2@users.personaai.app')
    expect(await loginAccount({ name: '老王', password: 'wang123' }, deps)).toMatchObject({ ok: true })
  })

  it('密碼太短不存', async () => {
    const { deps, calls } = fakeDeps([mingWithPassword])
    expect(await setAccountPassword('a1', { password: '12' }, deps)).toMatchObject({ code: 'invalid' })
    expect(calls.upgraded).toEqual([])
  })
})
