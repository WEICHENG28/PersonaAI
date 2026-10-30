// A 提供的跨線函式（docs/07 第 6 節）。擁有者：A。簽名是共用約定，改前三人同意。
// A4 起改為真實作：讀 user_profiles（service role）。
// 沒有 DB 設定（本機測試／mock 模式）時回退 fixtures，
// 行為與 B 的 searchLobby 記憶體模式一致（server/social/db.ts 的做法）。
import type { AgentProfile, ShareableProfile, StyleProfile, TaskReport } from '../../shared/types'
import { getServiceClient } from '../lib/supabase'
import { fakeAgentProfile, fakeShareable } from '../fixtures/friend'

type ProfileCol = 'shareable_profile' | 'agent_profile'

async function readProfileColumn<T>(userId: string, column: ProfileCol): Promise<T | null> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null
  const db = getServiceClient()
  const { data, error } = await db
    .from('user_profiles')
    .select(column)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error(`[contracts/friend] 读取 ${column} 失败`, error.message)
    return null
  }
  return (data as Record<string, T | null> | null)?.[column] ?? null
}

/** 對外檔案（給大廳／分身用）。無資料時回 null；無 DB 設定回 fixtures。 */
export async function getShareableProfile(userId: string): Promise<ShareableProfile | null> {
  const fallback = !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY
  const value = await readProfileColumn<ShareableProfile>(userId, 'shareable_profile')
  if (value) return value
  return fallback ? { ...fakeShareable } : null
}

/** 含 Big Five，只有 B 可以呼叫；不可傳給分身或前端。 */
export async function getAgentProfile(userId: string): Promise<AgentProfile | null> {
  const fallback = !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY
  const value = await readProfileColumn<AgentProfile>(userId, 'agent_profile')
  if (value) return structuredClone(value)
  return fallback ? structuredClone(fakeAgentProfile) : null
}

/** 只回 agent_profile.style（給分身模仿用）。 */
export async function getStyleProfile(userId: string): Promise<StyleProfile | null> {
  const agent = await getAgentProfile(userId)
  return agent ? { ...agent.style } : null
}

/**
 * A6：deliverReport（07 第 6 節）。
 * B 任務完成後呼叫：新增 notifications（type friend_report），
 * 下次見面（POST /api/friend/next-meet）時由 Prompt 8 產生朋友口吻回報。
 */
export async function deliverReport(userId: string, report: TaskReport): Promise<void> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // 無 DB 設定（測試／mock 模式）靜默跳過
    return
  }
  const db = getServiceClient()
  const { error } = await db.from('notifications').insert({
    user_id: userId,
    type: 'friend_report',
    payload: report as unknown as Record<string, unknown>,
  })
  if (error) {
    console.error('[deliverReport] 写入通知失败', error.message)
    throw new Error(`写入回报通知失败：${error.message}`)
  }
}

