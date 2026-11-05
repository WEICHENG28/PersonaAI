import { afterEach, describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { createLimiter, rateLimitMiddleware, type RateRule } from '../../server/lib/rateLimit'
import { BlockedContentError, assertAllowed, findBlocked, maskBlocked } from '../../server/lib/moderation'
import { UsageLimitError, assertWithinDailyLimit, setUsageCounter } from '../../server/social/usage'
import { blockUser, blockedIdsFor, listMyBlocks, reportUser, unblockUser, type SafetyStore } from '../../server/social/safety'
import { loginAccount, type AccountDeps, type AccountInfo } from '../../server/account/nameLogin'
import { CONFIG } from '../../server/lib/config'

describe('頻率限制', () => {
  it('滑動視窗：超過次數擋下，時間過了恢復', () => {
    let t = 0
    const limiter = createLimiter(() => t)
    expect([1, 2, 3].map(() => limiter.hit('k', 2, 1000))).toEqual([true, true, false])
    t = 1001
    expect(limiter.hit('k', 2, 1000)).toBe(true)
    expect(limiter.hit('other', 2, 1000)).toBe(true)
  })

  it('中介層：同一個 IP 打太多次回 429，其他路徑不受影響', async () => {
    const rules: RateRule[] = [{ name: 'login', method: 'POST', path: /^\/account\/login$/, limit: 2, windowMs: 60_000, by: 'ip', message: '太多次了' }]
    const app = new Hono().basePath('/api')
    app.use('*', rateLimitMiddleware(rules, createLimiter()))
    app.post('/account/login', (c) => c.json({ ok: true }))
    app.post('/account/register', (c) => c.json({ ok: true }))
    const call = (path: string, ip = '1.1.1.1') => app.request(`/api${path}`, { method: 'POST', headers: { 'x-forwarded-for': ip } })
    expect((await call('/account/login')).status).toBe(200)
    expect((await call('/account/login')).status).toBe(200)
    const blocked = await call('/account/login')
    expect(blocked.status).toBe(429)
    expect(await blocked.json()).toMatchObject({ ok: false, error: '太多次了' })
    expect((await call('/account/login', '2.2.2.2')).status).toBe(200)
    expect((await call('/account/register')).status).toBe(200)
  })
})

describe('敏感詞', () => {
  it('用戶的話有敏感詞就擋下，繞過空白和符號也抓得到', () => {
    expect(findBlocked('周末一起去爬山吗')).toBeNull()
    expect(findBlocked('要不要 约 炮')).toBe('约炮')
    expect(findBlocked('来玩网.赌')).toBe('网赌')
    expect(() => assertAllowed('你好', '加我刷单返利')).toThrow(BlockedContentError)
  })

  it('不擋求助的話（要讓阿澈接住，不是封鎖）', () => {
    expect(findBlocked('最近好累，有点想不开')).toBeNull()
  })

  it('AI 的話把敏感詞遮掉', () => {
    expect(maskBlocked('他说要赌博')).toBe('他说要＊＊')
  })
})

describe('每日用量上限', () => {
  afterEach(() => setUsageCounter(null))

  it('到上限回 429 錯誤，沒到就放行', async () => {
    setUsageCounter(async (kind) => (kind === 'task' ? CONFIG.DAILY_TASKS : 0))
    await expect(assertWithinDailyLimit('task', 'u1')).rejects.toBeInstanceOf(UsageLimitError)
    await expect(assertWithinDailyLimit('friend_message', 'u1')).resolves.toBeUndefined()
  })
})

function fakeSafety(users: Record<string, { name: string; isSeed: boolean }>) {
  const blocks: { blocker: string; target: string }[] = []
  const reports: { reporter: string; target: string }[] = []
  const hidden: string[] = []
  const ended: string[] = []
  const store: SafetyStore = {
    async blockPairs(id) {
      return blocks.filter((b) => b.blocker === id || b.target === id)
    },
    async addBlock(blocker, target) {
      blocks.push({ blocker, target })
    },
    async removeBlock(blocker, target) {
      const i = blocks.findIndex((b) => b.blocker === blocker && b.target === target)
      if (i >= 0) blocks.splice(i, 1)
    },
    async addReport(reporter, target) {
      reports.push({ reporter, target })
    },
    async reporterCount(target) {
      return new Set(reports.filter((r) => r.target === target).map((r) => r.reporter)).size
    },
    async userInfo(id) {
      return users[id] ?? null
    },
    async hideFromLobby(id) {
      hidden.push(id)
    },
    async endChatsBetween(a, b) {
      ended.push(`${a}-${b}`)
    },
  }
  return { store, blocks, hidden, ended }
}

describe('屏蔽與檢舉', () => {
  const users = { me: { name: '我', isSeed: false }, bad: { name: '坏人', isSeed: false }, seed: { name: '小安', isSeed: true }, a: { name: 'A', isSeed: false }, b: { name: 'B', isSeed: false } }

  it('屏蔽是雙向的，會結束兩人的聊天；不重複記；可以取消', async () => {
    const { store, blocks, ended } = fakeSafety(users)
    await blockUser('me', 'bad', store)
    await blockUser('me', 'bad', store)
    expect(blocks).toHaveLength(1)
    expect(ended).toContain('me-bad')
    expect(await blockedIdsFor('me', store)).toEqual(new Set(['bad']))
    expect(await blockedIdsFor('bad', store)).toEqual(new Set(['me']))
    expect(await listMyBlocks('me', store)).toEqual([{ userId: 'bad', name: '坏人' }])
    await unblockUser('me', 'bad', store)
    expect(await blockedIdsFor('bad', store)).toEqual(new Set())
  })

  it('不能屏蔽自己、找不到的人', async () => {
    const { store } = fakeSafety(users)
    await expect(blockUser('me', 'me', store)).rejects.toThrow('不能对自己')
    await expect(blockUser('me', 'ghost', store)).rejects.toThrow('找不到')
  })

  it('檢舉會順便屏蔽；同一個真人被 3 個不同的人檢舉才從大廳隱藏', async () => {
    const { store, hidden } = fakeSafety(users)
    expect(await reportUser('me', 'bad', { reason: 'scam' }, store)).toEqual({ name: '坏人', hidden: false })
    expect(await blockedIdsFor('me', store)).toEqual(new Set(['bad']))
    await reportUser('me', 'bad', { reason: 'scam' }, store) // 同一人重複檢舉不算
    await reportUser('a', 'bad', { reason: 'harass' }, store)
    expect(hidden).toEqual([])
    expect((await reportUser('b', 'bad', { reason: 'ad' }, store)).hidden).toBe(true)
    expect(hidden).toEqual(['bad'])
  })

  it('示範用戶（AI 扮演）不會被自動隱藏', async () => {
    const { store, hidden } = fakeSafety(users)
    for (const who of ['me', 'a', 'b']) await reportUser(who, 'seed', { reason: 'other' }, store)
    expect(hidden).toEqual([])
  })
})

describe('登入鎖定', () => {
  function deps(account: AccountInfo, now: Date) {
    const state = { account: { ...account }, issued: 0 }
    const d: AccountDeps = {
      findAccount: async () => state.account,
      getAccount: async () => state.account,
      isReservedName: async () => false,
      createAccount: async () => 'x',
      verifyPassword: async (_e, pw) => pw === 'right123',
      upgradeAccount: async () => {},
      setLoginFailures: async (_id, fails, lockedUntil) => {
        state.account = { ...state.account, loginFails: fails, lockedUntil }
      },
      issueLogin: async () => {
        state.issued++
        return { tokenHash: 'h', verificationType: 'magiclink' }
      },
      ensureProfile: async () => {},
      now: () => now,
    }
    return { d, state }
  }
  const base: AccountInfo = { authId: 'a1', email: 'a1@x', hasPassword: true, guest: false }

  it(`連續打錯 ${CONFIG.LOGIN_MAX_FAILS} 次就鎖住，鎖住時密碼對也不能進`, async () => {
    const now = new Date('2026-11-06T00:00:00Z')
    const { d, state } = deps(base, now)
    for (let i = 1; i < CONFIG.LOGIN_MAX_FAILS; i++) {
      expect(await loginAccount({ name: '小明', password: 'wrong' }, d)).toMatchObject({ code: 'wrong_password' })
    }
    expect(await loginAccount({ name: '小明', password: 'wrong' }, d)).toMatchObject({ code: 'locked' })
    expect(await loginAccount({ name: '小明', password: 'right123' }, d)).toMatchObject({ code: 'locked' })
    expect(state.issued).toBe(0)
  })

  it('鎖定時間過了就能登入，成功後次數歸零', async () => {
    const now = new Date('2026-11-06T01:00:00Z')
    const { d, state } = deps({ ...base, loginFails: 3, lockedUntil: '2026-11-06T00:30:00Z' }, now)
    expect(await loginAccount({ name: '小明', password: 'right123' }, d)).toMatchObject({ ok: true })
    expect(state.account).toMatchObject({ loginFails: 0, lockedUntil: null })
  })
})
