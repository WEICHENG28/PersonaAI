// B 線取得 Supabase 管理端 client：沿用 A 的單例（server/lib/supabase.ts）。
// 沒設定 SUPABASE_URL／SUPABASE_SERVICE_ROLE_KEY 時回 null，B 線改用記憶體模式（本機開發、測試）。
import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from '../lib/supabase.js'

export function getAdminDb(): SupabaseClient | null {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null
  return getServiceClient()
}
