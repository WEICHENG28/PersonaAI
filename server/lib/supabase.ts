/**
 * 后端 Supabase client（service role，仅 server/scripts 用）。A0b。
 * C0 seed 等也会改用这里（见 Jerry PR #48 备注）。
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

/** 单例 service-role client。缺环境变量时抛错（简体中文）。 */
export function getServiceClient(): SupabaseClient {
  if (cached) return cached
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY，请检查 .env.local')
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}

/** 测试用：清掉单例，方便换假 client。 */
export function resetServiceClientForTest(): void {
  cached = null
}
