// 取得目前登入者的 users.id。
// A0b 的驗證 middleware 會 c.set('userId', …)；在那之前，沒設定 Supabase 的本機開發用固定的 dev 用戶。
import type { Context } from 'hono'
import { getAdminDb } from './db'
import { TaskError } from './task'

export const DEV_USER_ID = 'dev-user'

export function requireUserId(c: Context): string {
  const fromAuth = (c.get as (key: string) => unknown)('userId')
  if (typeof fromAuth === 'string' && fromAuth) return fromAuth
  // 只有在完全沒接資料庫（記憶體模式）時才允許，避免正式資料被假身份寫入
  if (!getAdminDb()) return DEV_USER_ID
  throw new TaskError('请先登录', 403)
}
