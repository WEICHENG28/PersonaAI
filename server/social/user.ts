// 取得目前登入者的 users.id（agent_tasks 等表的 user_id 是 users.id，不是 auth 的 id）。
// 用 A 的 requireAuth 驗證 Bearer JWT，再用 users.auth_id 對回 users.id。
// 完全沒接資料庫（記憶體模式）時，用固定的 dev 用戶，方便本機開發與測試。
import type { Context } from 'hono'
import { isAuthFailure, requireAuth } from '../lib/auth.js'
import { getAdminDb } from './db.js'

export const DEV_USER_ID = 'dev-user'

/** 成功回 users.id；失敗回已寫好的 401／403 Response，路由直接 return 它。 */
export async function requireUserId(c: Context): Promise<string | Response> {
  const db = getAdminDb()
  if (!db) return DEV_USER_ID

  const authed = await requireAuth(c)
  if (isAuthFailure(authed)) return authed

  const { data, error } = await db.from('users').select('id').eq('auth_id', authed.authId).maybeSingle()
  if (error) throw error
  if (!data) return c.json({ ok: false, error: '找不到你的用户资料，请重新进入一次' }, 403)
  return data.id as string
}
