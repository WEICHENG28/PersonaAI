// C0：建立 10 位種子用戶（docs/07C C0 第 3 點）。擁有者：C。
// 這裡只放流程；連 Supabase 的部分在 scripts/seed.ts，測試時換成假的 SeedDb。
import type { AgentProfile, Preferences, Purpose, ShareableProfile } from '../../shared/types'
import { SEED_USERS, type SeedUser } from '../fixtures/seed-users'

export interface SeedUserRow {
  display_name: string
  is_seed: true
  auth_id: null
  social_agent_enabled: true
  purposes: Purpose[]
  preferences: Preferences
}

export interface SeedProfileRow {
  user_id: string
  shareable_profile: ShareableProfile
  shareable_confirmed: true
  agent_profile: AgentProfile
  embedding: number[]
}

export interface SeedDb {
  /** 刪除所有 is_seed = true 的用戶（user_profiles 會跟著 cascade 刪除），回傳刪除筆數。 */
  deleteSeedUsers(): Promise<number>
  /** 新增一位用戶，回傳 users.id。 */
  insertUser(row: SeedUserRow): Promise<string>
  insertProfile(row: SeedProfileRow): Promise<void>
}

export type EmbedFn = (text: string) => Promise<number[]>

export interface SeedSummary {
  deleted: number
  inserted: { key: string; display_name: string; user_id: string }[]
}

/** 產生 embedding 用的文字：只用對外檔案（docs/02 第 7 節，agent_profile 不對外）。 */
export function shareableToText(p: ShareableProfile): string {
  return [`简介：${p.intro}`, `兴趣：${p.interests.join('、')}`, `聊天风格：${p.chat_style}`, `想找：${p.looking_for}`].join('\n')
}

/**
 * 先算好全部向量，再刪舊的種子用戶、寫入新的。
 * 向量失敗時直接丟錯，不會刪掉舊資料；寫入中途失敗時重跑即可（會先刪掉這次寫了一半的種子用戶）。
 */
export async function runSeed(db: SeedDb, embedFn: EmbedFn, users: readonly SeedUser[] = SEED_USERS): Promise<SeedSummary> {
  const embeddings = await Promise.all(users.map((u) => embedFn(shareableToText(u.shareable))))
  const deleted = await db.deleteSeedUsers()
  const inserted: SeedSummary['inserted'] = []
  for (const [i, user] of users.entries()) {
    const userId = await insertOne(db, user, embeddings[i]!)
    inserted.push({ key: user.key, display_name: user.display_name, user_id: userId })
  }
  return { deleted, inserted }
}

async function insertOne(db: SeedDb, user: SeedUser, embedding: number[]): Promise<string> {
  const userId = await db.insertUser({
    display_name: user.display_name,
    is_seed: true,
    auth_id: null,
    social_agent_enabled: true,
    purposes: [...user.purposes],
    preferences: { ...user.preferences, conditions: [...user.preferences.conditions] },
  })
  await db.insertProfile({
    user_id: userId,
    shareable_profile: user.shareable,
    shareable_confirmed: true,
    agent_profile: user.agent_profile,
    embedding,
  })
  return userId
}
