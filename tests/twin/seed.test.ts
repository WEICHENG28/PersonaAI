// C0：npm run seed 的流程（假資料庫＋假 embed，不連 Supabase、不打 LLM）。
import { describe, expect, it, vi } from 'vitest'
import { SEED_USERS } from '../../server/fixtures/seed-users'
import { runSeed, shareableToText, type SeedDb, type SeedProfileRow, type SeedUserRow } from '../../server/twin/seed'

type StoredUser = Omit<SeedUserRow, 'is_seed' | 'social_agent_enabled'> & {
  id: string
  is_seed: boolean
  social_agent_enabled: boolean
}

/** 模擬 users／user_profiles 兩張表；刪 users 時連帶刪 profile（on delete cascade）。 */
function fakeDb(existing: StoredUser[] = []) {
  let users: StoredUser[] = [...existing]
  let profiles: SeedProfileRow[] = []
  let nextId = 1
  const db: SeedDb = {
    deleteSeedUsers: vi.fn(async () => {
      const removed = users.filter((u) => u.is_seed).map((u) => u.id)
      users = users.filter((u) => !u.is_seed)
      profiles = profiles.filter((p) => !removed.includes(p.user_id))
      return removed.length
    }),
    insertUser: vi.fn(async (row) => {
      const id = `uuid-${nextId++}`
      users = [...users, { ...row, id }]
      return id
    }),
    insertProfile: vi.fn(async (row) => {
      profiles = [...profiles, row]
    }),
  }
  return { db, users: () => users, profiles: () => profiles }
}

const fakeEmbed = vi.fn(async (text: string) => [text.length, 0.1, 0.2, 0.3])

const realUser: StoredUser = {
  id: 'real-1', display_name: 'c-test1', is_seed: false, auth_id: null,
  social_agent_enabled: false, purposes: ['friend'], preferences: { personality: 'similar', conditions: [] },
}

describe('runSeed', () => {
  it('寫入 10 位種子用戶，旗標與檔案照 07C C0', async () => {
    const store = fakeDb()
    const summary = await runSeed(store.db, fakeEmbed)

    expect(summary.inserted).toHaveLength(10)
    for (const u of store.users()) {
      expect(u).toMatchObject({ is_seed: true, social_agent_enabled: true, auth_id: null })
    }
    expect(store.profiles()).toHaveLength(10)
    for (const p of store.profiles()) {
      expect(p.shareable_confirmed).toBe(true)
      expect(p.shareable_profile).not.toBeNull()
      expect(p.agent_profile).not.toBeNull()
      expect(p.embedding.length).toBeGreaterThan(0)
    }
  })

  it('embedding 用對外檔案產生，不含 agent_profile', async () => {
    const store = fakeDb()
    const embedSpy = vi.fn(async () => [1, 2, 3])
    await runSeed(store.db, embedSpy)

    const an = SEED_USERS[0]!
    expect(embedSpy).toHaveBeenCalledWith(shareableToText(an.shareable))
    const text = shareableToText(an.shareable)
    expect(text).toContain('登山')
    expect(text).not.toContain(an.agent_profile.big_five.O.evidence)
  })

  it('重複執行先刪舊的種子用戶，仍然剛好 10 位；不動真人用戶', async () => {
    const store = fakeDb([realUser])
    await runSeed(store.db, fakeEmbed)
    const second = await runSeed(store.db, fakeEmbed)

    expect(second.deleted).toBe(10)
    expect(store.users().filter((u) => u.is_seed)).toHaveLength(10)
    expect(store.profiles()).toHaveLength(10)
    expect(store.users()).toContainEqual(realUser)
  })

  it('產生向量失敗時不刪任何舊資料', async () => {
    const store = fakeDb()
    await runSeed(store.db, fakeEmbed)
    const failingEmbed = vi.fn(async () => {
      throw new Error('LLM 掛了')
    })

    await expect(runSeed(store.db, failingEmbed)).rejects.toThrow('LLM 掛了')
    expect(store.users().filter((u) => u.is_seed)).toHaveLength(10)
  })
})
