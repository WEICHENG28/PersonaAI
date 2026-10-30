import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getPublicEnv, getServerEnv } from '@/lib/env'

/**
 * Server-side Supabase access — server-only module.
 *
 * - createClient(): anon key bound to the user's cookie session; use this for
 *   auth and for reads the RLS policies allow (07 §7.7).
 * - createServiceClient(): service role; ONLY in trusted server code
 *   (init rows, worker-style writes). Never import into client components.
 */
export function createClient() {
  const { supabaseUrl, supabaseAnonKey } = getPublicEnv()
  const cookieStore = cookies()

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Called from a Server Component — middleware refreshes the session.
        }
      },
    },
  })
}

export function createServiceClient() {
  const { supabaseUrl, supabaseServiceRoleKey } = getServerEnv()
  return createSupabaseClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
