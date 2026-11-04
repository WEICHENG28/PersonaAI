// 帳號流程的 Supabase 實作（service role，只在後端）。
import { createClient } from '@supabase/supabase-js'
import { getServiceClient } from '../lib/supabase.js'
import { initUserProfile } from '../lib/profile.js'
import type { AccountDeps, AccountInfo } from './nameLogin.js'

type AuthUser = { id: string; email?: string | null; app_metadata?: Record<string, unknown> }

function toInfo(user: AuthUser): AccountInfo {
  return {
    authId: user.id,
    email: user.email || null,
    hasPassword: user.app_metadata?.has_password === true,
    guest: user.app_metadata?.guest === true,
  }
}

export function supabaseAccountDeps(): AccountDeps {
  const db = getServiceClient()
  return {
    async findAccount(name) {
      const { data, error } = await db
        .from('users')
        .select('auth_id')
        .eq('display_name', name)
        .eq('is_seed', false)
        .not('auth_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      if (!data?.auth_id) return null
      const { data: auth, error: authError } = await db.auth.admin.getUserById(data.auth_id as string)
      if (authError || !auth.user) return null
      return toInfo(auth.user)
    },
    async getAccount(authId) {
      const { data, error } = await db.auth.admin.getUserById(authId)
      if (error || !data.user) return null
      return toInfo(data.user)
    },
    async isReservedName(name) {
      const { count, error } = await db.from('users').select('id', { count: 'exact', head: true }).eq('display_name', name).eq('is_seed', true)
      if (error) throw error
      return (count ?? 0) > 0
    },
    async createAccount(email, displayName, opts) {
      const { data, error } = await db.auth.admin.createUser({
        email,
        email_confirm: true,
        ...(opts.password ? { password: opts.password } : {}),
        user_metadata: { display_name: displayName },
        app_metadata: { has_password: Boolean(opts.password), guest: Boolean(opts.guest) },
      })
      if (error || !data.user) throw error ?? new Error('建立帐号失败')
      return data.user.id
    },
    async verifyPassword(email, password) {
      // 用一次性的 client 驗密碼，不影響共用的 service client
      const url = process.env.SUPABASE_URL
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!url || !key) throw new Error('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY')
      const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
      const { error } = await client.auth.signInWithPassword({ email, password })
      return !error
    },
    async upgradeAccount(authId, patch) {
      const { error } = await db.auth.admin.updateUserById(authId, {
        password: patch.password,
        ...(patch.email ? { email: patch.email, email_confirm: true } : {}),
        ...(patch.displayName ? { user_metadata: { display_name: patch.displayName } } : {}),
        app_metadata: { has_password: true, guest: false },
      })
      if (error) throw error
      if (patch.displayName) {
        const { error: nameError } = await db.from('users').update({ display_name: patch.displayName }).eq('auth_id', authId)
        if (nameError) throw nameError
      }
    },
    async issueLogin(email) {
      const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email })
      if (error || !data.properties?.hashed_token) throw error ?? new Error('产生登录凭证失败')
      return { tokenHash: data.properties.hashed_token, verificationType: data.properties.verification_type ?? 'magiclink' }
    },
    async ensureProfile(authId, email, displayName) {
      await initUserProfile({ authId, email, displayName })
    },
  }
}
