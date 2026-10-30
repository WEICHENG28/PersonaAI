/** 前端 Supabase client（anon key，浏览器可见）。A0b。 */
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(
  url ?? 'http://127.0.0.1:54321',
  anonKey ?? 'PUBLIC_ANON_KEY_MISSING',
)

/** 是否走 http 模式（打 /api ＋真实 Supabase Auth）；预设 mock。 */
export const isHttpMode = import.meta.env.VITE_API_MODE === 'http'
