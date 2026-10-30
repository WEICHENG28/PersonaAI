import { createClient } from '@supabase/supabase-js'
import { getPublicEnv } from '@/lib/env'

/**
 * Browser Supabase client (anon key). Frontend only reads its own data and
 * subscribes to Realtime with this client (07 §7.7).
 */
export function createBrowserClient() {
  const { supabaseUrl, supabaseAnonKey } = getPublicEnv()
  return createClient(supabaseUrl, supabaseAnonKey)
}
