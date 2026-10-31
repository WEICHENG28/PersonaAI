// nameLogin 的 Supabase 實作（service role，只在後端）。
import { getServiceClient } from '../lib/supabase.js'
import { initUserProfile } from '../lib/profile.js'
import type { NameLoginDeps } from './nameLogin.js'

export function supabaseNameLoginDeps(): NameLoginDeps {
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
      return { authId: auth.user.id, email: auth.user.email || null }
    },
    async isReservedName(name) {
      const { count, error } = await db.from('users').select('id', { count: 'exact', head: true }).eq('display_name', name).eq('is_seed', true)
      if (error) throw error
      return (count ?? 0) > 0
    },
    async setEmail(authId, email) {
      const { error } = await db.auth.admin.updateUserById(authId, { email, email_confirm: true })
      if (error) throw error
    },
    async createAccount(email, displayName) {
      const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { display_name: displayName } })
      if (error || !data.user) throw error ?? new Error('建立帐号失败')
      return data.user.id
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
