// B2｜搜尋大廳（docs/07B 的 B2、02 F4）。擁有者：B。
import type { LobbyCandidate, LobbyQuery, Purpose, ShareableProfile } from '../../shared/types.js'
import { embed } from '../lib/llm/index.js'
import { writeLog } from '../lib/log.js'
import { SEED_USERS } from '../fixtures/seed-users.js'
import { getAdminDb } from './db.js'
import { PURPOSE_LABEL } from './task.js'

const DEFAULT_LIMIT = 5
const KEYWORD_BONUS = 0.1

/** 大廳裡可以被搜尋到的人（已開社交 Agent、已確認對外檔案）。 */
export interface LobbyEntry {
  user_id: string
  display_name: string
  purposes: Purpose[]
  shareable: ShareableProfile
  embedding: number[] | null
}

export type LobbySource = () => Promise<LobbyEntry[]>

let override: LobbySource | null = null

/** 測試用：傳 null 還原。 */
export function setLobbySource(source: LobbySource | null): void {
  override = source
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! ** 2
    nb += b[i]! ** 2
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

/** 條件關鍵字出現在對方興趣裡（雙向包含，例如「喜欢登山」對上「登山」）。 */
export function matchesKeyword(conditions: string[], interests: string[]): boolean {
  const keys = conditions.map((c) => c.replace(/^喜欢|^爱/, '').trim()).filter(Boolean)
  return keys.some((k) => interests.some((i) => i.includes(k) || k.includes(i)))
}

/** 依向量相似度排序，條件關鍵字有出現在 interests 的加 0.1；沒有向量就只看關鍵字。 */
export function rankCandidates(entries: LobbyEntry[], queryVector: number[] | null, conditions: string[]): LobbyCandidate[] {
  return entries
    .map((e) => {
      const base = queryVector && e.embedding ? cosineSimilarity(queryVector, e.embedding) : 0
      const bonus = matchesKeyword(conditions, e.shareable.interests) ? KEYWORD_BONUS : 0
      return { user_id: e.user_id, display_name: e.display_name, shareable: e.shareable, similarity: round(base + bonus) }
    })
    .sort((a, b) => b.similarity - a.similarity)
}

export async function searchLobby(userId: string, q: LobbyQuery): Promise<LobbyCandidate[]> {
  const conditions = q.conditions ?? []
  const excluded = new Set([userId, ...(q.excludeIds ?? [])])
  const purpose = q.purpose ?? 'friend'
  const pool = (await (override ?? defaultSource)()).filter(
    (e) => !excluded.has(e.user_id) && (purpose === 'friend' || e.purposes.includes(purpose)),
  )

  const queryText = q.text?.trim() || [...conditions, PURPOSE_LABEL[purpose]].join('，')
  const { vector, note } = await queryVector(queryText, pool)
  const result = rankCandidates(pool, vector, conditions).slice(0, q.limit ?? DEFAULT_LIMIT)

  await writeLog({
    user_id: userId,
    agent: 'social',
    action: `搜索大厅：${conditions.join('、') || queryText} → 找到 ${result.length} 位`,
    reason: `目的：${PURPOSE_LABEL[purpose]}；大厅符合条件 ${pool.length} 位；${note}`,
    detail: { candidates: result.map((c) => ({ user_id: c.user_id, similarity: c.similarity })) },
  })
  return result
}

/** 算查詢向量；失敗或候選人都沒有向量時退回關鍵字排序，不讓任務卡住。 */
async function queryVector(text: string, pool: LobbyEntry[]): Promise<{ vector: number[] | null; note: string }> {
  if (!pool.some((e) => e.embedding)) return { vector: null, note: '候选人还没有向量，按兴趣关键字排序' }
  try {
    return { vector: await embed(text), note: '按语义相似度排序，兴趣命中条件加分' }
  } catch (err) {
    console.error('[searchLobby] embed 失败，改用关键字排序', err)
    return { vector: null, note: '语义向量暂时无法使用，按兴趣关键字排序' }
  }
}

async function defaultSource(): Promise<LobbyEntry[]> {
  const db = getAdminDb()
  if (!db) return seedFixtureSource()
  const { data, error } = await db
    .from('users')
    .select('id, display_name, purposes, user_profiles!inner(shareable_profile, shareable_confirmed, embedding)')
    .eq('social_agent_enabled', true)
    .eq('user_profiles.shareable_confirmed', true)
  if (error) throw error
  return (data ?? []).flatMap((row) => {
    const profile = Array.isArray(row.user_profiles) ? row.user_profiles[0] : row.user_profiles
    if (!profile?.shareable_profile) return []
    return [
      {
        user_id: row.id as string,
        display_name: row.display_name as string,
        purposes: (row.purposes ?? []) as Purpose[],
        shareable: profile.shareable_profile as ShareableProfile,
        embedding: parseVector(profile.embedding),
      },
    ]
  })
}

/** 沒接資料庫時（記憶體模式）用 C 的種子用戶資料，沒有向量。 */
function seedFixtureSource(): Promise<LobbyEntry[]> {
  return Promise.resolve(
    SEED_USERS.map((u) => ({
      user_id: u.key,
      display_name: u.display_name,
      purposes: [...u.purposes],
      shareable: u.shareable,
      embedding: null,
    })),
  )
}

/** pgvector 經 PostgREST 回傳的是字串 "[0.1,0.2,…]"。 */
export function parseVector(value: unknown): number[] | null {
  if (Array.isArray(value)) return value.map(Number)
  if (typeof value !== 'string' || !value.startsWith('[')) return null
  try {
    return (JSON.parse(value) as unknown[]).map(Number)
  } catch {
    return null
  }
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}
