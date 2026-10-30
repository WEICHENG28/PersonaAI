// C0：npm run seed 的流程（假資料庫＋假 embed，不連 Supabase、不打 LLM）。
// 重跑時依名字更新現有種子用戶、不刪除（conversations／messages 指向 users 且沒有 cascade，ID 也要給 B 用）。
import { describe, expect, it, vi } from 'vitest'
import { SEED_USERS } from '../../server/fixtures/seed-users'
import {
  runSeed,
  shareableToText,
  type SeedDb,
  type SeedProfileRow,
  type SeedUserRow,
  type SeedUserUpdate,
} from '../../server/twin/seed'

interface StoredUser {
  id: string
  display_name: string
  is_seed: boolean
  auth_id: string | null
  social_agent_enabled: boolean
  purposes: SeedUserRow['purposes']
  preferences: SeedUserRow['preferences']
}

type StoredProfile = Omit<SeedProfileRow, 'card'> & { card: unknown }

const NOW = new Date('2026-10-30T14:00:00Z')

/** 模擬 users／user_profiles 兩張表；user_profiles 以 user_id 為主鍵。 */
function fakeDb(existingUsers: StoredUser[] = [], existingProfiles: StoredProfile[] = []) {
  let users: StoredUser[] = [...existingUsers]
  let profiles: StoredProfile[] = [...existingProfiles]
  let nextId = 1
  const db = {
    listSeedUsers: vi.fn(async () => users.filter((u) => u.is_seed).map(({ id, display_name }) => ({ id, display_name }))),
    updateUser: vi.fn(async (id: string, patch: SeedUserUpdate) => {
      users = users.map((u) => (u.id === id ? { ...u, ...patch } : u))
    }),
    insertUser: vi.fn(async (row: SeedUserRow) => {
      const id = `uuid-${nextId++}`
      users = [...users, { ...row, id }]
      return id
    }),
    upsertProfile: vi.fn(async (row: SeedProfileRow) => {
      profiles = [...profiles.filter((p) => p.user_id !== row.user_id), row]
    }),
  } satisfies SeedDb
  return { db, users: () => users, profiles: () => profiles }
}

const fakeEmbed = vi.fn(async (text: string) => [text.length, 0.1, 0.2, 0.3])
const now = () => NOW

const AN = SEED_USERS[0]!

function seedUser(id: string, display_name: string, overrides: Partial<StoredUser> = {}): StoredUser {
  return {
    id,
    display_name,
    is_seed: true,
    auth_id: null,
    social_agent_enabled: false,
    purposes: ['friend'],
    preferences: { personality: 'similar', conditions: [] },
    ...overrides,
  }
}

const realUser: StoredUser = seedUser('real-1', 'c-test1', { is_seed: false })

describe('runSeed', () => {
  it('資料庫是空的：新增 10 位種子用戶，旗標與檔案照 07C C0', async () => {
    const store = fakeDb()
    const summary = await runSeed(store.db, fakeEmbed, SEED_USERS, now)

    expect(summary.inserted).toHaveLength(10)
    expect(summary.updated).toHaveLength(0)
    for (const u of store.users()) {
      expect(u).toMatchObject({ is_seed: true, social_agent_enabled: true, auth_id: null })
    }
    expect(store.profiles()).toHaveLength(10)
    for (const p of store.profiles()) {
      expect(p).toMatchObject({ shareable_confirmed: true, card: null, updated_at: NOW.toISOString() })
      expect(p.shareable_profile).not.toBeNull()
      expect(p.agent_profile).not.toBeNull()
      expect(p.embedding.length).toBeGreaterThan(0)
    }
  })

  it('embedding 用對外檔案產生，不含 agent_profile', async () => {
    const store = fakeDb()
    const embedSpy = vi.fn(async () => [1, 2, 3])
    await runSeed(store.db, embedSpy, SEED_USERS, now)

    expect(embedSpy).toHaveBeenCalledWith(shareableToText(AN.shareable))
    const text = shareableToText(AN.shareable)
    expect(text).toContain('登山')
    expect(text).not.toContain(AN.agent_profile.big_five.O.evidence)
  })

  it('已存在的種子用戶：更新、id 不變、card 設為 null、兩個 true 都有寫', async () => {
    const oldProfile: StoredProfile = {
      user_id: 'old-an',
      shareable_profile: { intro: '旧的', interests: [], chat_style: '', looking_for: '' },
      shareable_confirmed: true,
      agent_profile: AN.agent_profile,
      embedding: [9, 9, 9],
      card: { tagline: '旧卡片' },
      updated_at: '2026-10-29T00:00:00Z',
    }
    const store = fakeDb([seedUser('old-an', AN.display_name)], [oldProfile])
    const summary = await runSeed(store.db, fakeEmbed, [AN], now)

    expect(summary.updated).toEqual([{ key: AN.key, display_name: AN.display_name, user_id: 'old-an' }])
    expect(summary.inserted).toHaveLength(0)
    expect(store.db.insertUser).not.toHaveBeenCalled()
    expect(store.users()).toEqual([
      expect.objectContaining({ id: 'old-an', social_agent_enabled: true, purposes: AN.purposes, preferences: AN.preferences }),
    ])
    expect(store.profiles()).toEqual([
      expect.objectContaining({
        user_id: 'old-an',
        shareable_profile: AN.shareable,
        shareable_confirmed: true,
        embedding: await fakeEmbed(shareableToText(AN.shareable)),
        card: null,
        updated_at: NOW.toISOString(),
      }),
    ])
  })

  it('有的已存在、有的沒有：分別更新與新增；重跑一次 id 全部不變、不會多出人', async () => {
    const store = fakeDb([realUser, seedUser('old-an', AN.display_name)])
    const first = await runSeed(store.db, fakeEmbed, SEED_USERS, now)
    expect(first.updated.map((u) => u.user_id)).toEqual(['old-an'])
    expect(first.inserted).toHaveLength(9)

    const idsBefore = store.users().map((u) => u.id)
    const second = await runSeed(store.db, fakeEmbed, SEED_USERS, now)
    expect(second.updated).toHaveLength(10)
    expect(second.inserted).toHaveLength(0)
    expect(store.users().map((u) => u.id)).toEqual(idsBefore)
    expect(store.users()).toContainEqual(realUser)
  })

  it('產生向量失敗時不呼叫任何寫入', async () => {
    const store = fakeDb([seedUser('old-an', AN.display_name)])
    const failingEmbed = vi.fn(async () => {
      throw new Error('LLM 掛了')
    })

    await expect(runSeed(store.db, failingEmbed, SEED_USERS, now)).rejects.toThrow('LLM 掛了')
    expect(store.db.updateUser).not.toHaveBeenCalled()
    expect(store.db.insertUser).not.toHaveBeenCalled()
    expect(store.db.upsertProfile).not.toHaveBeenCalled()
  })

  it('同名的種子用戶有兩位：丟錯並列出名字和 id，不寫任何資料', async () => {
    const store = fakeDb([seedUser('dup-1', AN.display_name), seedUser('dup-2', AN.display_name)])

    const error = await runSeed(store.db, fakeEmbed, SEED_USERS, now).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain(AN.display_name)
    expect((error as Error).message).toContain('dup-1')
    expect((error as Error).message).toContain('dup-2')
    expect(store.db.updateUser).not.toHaveBeenCalled()
    expect(store.db.insertUser).not.toHaveBeenCalled()
    expect(store.db.upsertProfile).not.toHaveBeenCalled()
  })

  it('清單外的舊種子用戶不會被刪，只列在 untouched', async () => {
    const stale = seedUser('stale-1', '旧角色')
    const store = fakeDb([stale])
    const summary = await runSeed(store.db, fakeEmbed, SEED_USERS, now)

    expect(summary.untouched).toEqual([{ display_name: '旧角色', user_id: 'stale-1' }])
    expect(store.users()).toContainEqual(stale)
    expect('deleteSeedUsers' in store.db).toBe(false)
  })
})
