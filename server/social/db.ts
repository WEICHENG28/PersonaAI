// B 線暫用的 Supabase 管理端 client。
// TODO(A0b 之後)：改用 A 的 server/lib/supabase.ts，刪掉這個檔案。
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null | undefined

/** 有設定 SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY 才回傳 client；沒有就回 null（改用記憶體模式）。 */
export function getAdminDb(): SupabaseClient | null {
  if (client !== undefined) return client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null
  return client
}
