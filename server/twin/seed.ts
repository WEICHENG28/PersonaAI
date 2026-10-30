// C0：建立／更新 10 位種子用戶（docs/07C C0 第 3 點）。擁有者：C。
// 這裡只放流程；連 Supabase 的部分在 scripts/seed.ts，測試時換成假的 SeedDb。
// 重跑時依 display_name 更新現有種子用戶、不刪除：conversations、messages 指向 users 且沒有 on delete cascade，
// 而且 B 記錄的已嘗試名單、指定對象用的是 users.id，ID 要保持不變。
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

/** 更新現有種子用戶時寫入的欄位（id、display_name 不變）。 */
export type SeedUserUpdate = Pick<SeedUserRow, 'social_agent_enabled' | 'purposes' | 'preferences'>

export interface SeedProfileRow {
  user_id: string
  shareable_profile: ShareableProfile
  shareable_confirmed: true
  agent_profile: AgentProfile
  embedding: number[]
  /** 設為 null，讓 C9 依新的檔案重新產生大廳卡片。 */
  card: null
  updated_at: string
}

export interface ExistingSeedUser {
  id: string
  display_name: string
}

export interface SeedDb {
  /** 所有 is_seed = true 的用戶。 */
  listSeedUsers(): Promise<ExistingSeedUser[]>
  updateUser(id: string, patch: SeedUserUpdate): Promise<void>
  /** 新增一位用戶，回傳 users.id。 */
  insertUser(row: SeedUserRow): Promise<string>
  /** 以 user_id 為主鍵寫入（有就覆蓋、沒有就新增）。 */
  upsertProfile(row: SeedProfileRow): Promise<void>
}

export type EmbedFn = (text: string) => Promise<number[]>

export interface SeedResultUser {
  key: string
  display_name: string
  user_id: string
}

export interface SeedSummary {
  updated: SeedResultUser[]
  inserted: SeedResultUser[]
  /** 不在 SEED_USERS 清單裡的舊種子用戶：不刪，只列出來。 */
  untouched: { display_name: string; user_id: string }[]
}

/** 產生 embedding 用的文字：只用對外檔案（docs/02 第 7 節，agent_profile 不對外）。 */
export function shareableToText(p: ShareableProfile): string {
  return [`简介：${p.intro}`, `兴趣：${p.interests.join('、')}`, `聊天风格：${p.chat_style}`, `想找：${p.looking_for}`].join('\n')
}

/** 依名字找出每位種子用戶已存在的 id；同名兩位以上時丟錯，不自己挑。 */
export function matchExisting(existing: readonly ExistingSeedUser[], users: readonly SeedUser[]): Map<string, string> {
  const matched = new Map<string, string>()
  const duplicates: string[] = []
  for (const user of users) {
    const hits = existing.filter((e) => e.display_name === user.display_name)
    if (hits.length > 1) duplicates.push(`${user.display_name}：${hits.map((h) => h.id).join('、')}`)
    if (hits.length === 1) matched.set(user.key, hits[0]!.id)
  }
  if (duplicates.length > 0) {
    throw new Error(`同名的种子用户不止一位，请先确认要保留哪一位：${duplicates.join('；')}`)
  }
  return matched
}

/**
 * 先算好全部向量、比對現有種子用戶，都沒問題才寫入。
 * 向量失敗或同名重複時直接丟錯，不寫任何資料；寫入中途失敗時重跑即可（已寫的那幾位會被更新，不會重複新增）。
 */
export async function runSeed(
  db: SeedDb,
  embedFn: EmbedFn,
  users: readonly SeedUser[] = SEED_USERS,
  now: () => Date = () => new Date(),
): Promise<SeedSummary> {
  const embeddings = await Promise.all(users.map((u) => embedFn(shareableToText(u.shareable))))
  const existing = await db.listSeedUsers()
  const matched = matchExisting(existing, users)
  const summary: SeedSummary = { updated: [], inserted: [], untouched: [] }

  for (const [i, user] of users.entries()) {
    const existingId = matched.get(user.key)
    const userId = existingId ?? (await db.insertUser(newUserRow(user)))
    if (existingId) await db.updateUser(existingId, userFields(user))
    await db.upsertProfile(profileRow(user, userId, embeddings[i]!, now()))
    const entry = { key: user.key, display_name: user.display_name, user_id: userId }
    summary[existingId ? 'updated' : 'inserted'].push(entry)
  }

  const names = new Set(users.map((u) => u.display_name))
  summary.untouched = existing.filter((e) => !names.has(e.display_name)).map((e) => ({ display_name: e.display_name, user_id: e.id }))
  return summary
}

function userFields(user: SeedUser): SeedUserUpdate {
  return {
    social_agent_enabled: true,
    purposes: [...user.purposes],
    preferences: { ...user.preferences, conditions: [...user.preferences.conditions] },
  }
}

function newUserRow(user: SeedUser): SeedUserRow {
  return { display_name: user.display_name, is_seed: true, auth_id: null, ...userFields(user) }
}

function profileRow(user: SeedUser, userId: string, embedding: number[], at: Date): SeedProfileRow {
  return {
    user_id: userId,
    shareable_profile: user.shareable,
    shareable_confirmed: true,
    agent_profile: user.agent_profile,
    embedding,
    card: null,
    updated_at: at.toISOString(),
  }
}
