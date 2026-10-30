import { createServiceClient } from '@/lib/supabase/server'

/**
 * Single writer for the three registration rows (07A A0.5, vibecodex B10):
 * users / ai_friends / user_profiles. Idempotent — repeated calls detect the
 * existing user row and do nothing.
 */
export async function initializeUserProfile(
  authId: string,
  displayName: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', authId)
    .maybeSingle()

  if (existing) return { ok: true }

  const { data: user, error: userError } = await supabase
    .from('users')
    .insert({ auth_id: authId, display_name: displayName })
    .select('id')
    .single()

  if (userError || !user) {
    return { ok: false, error: `users insert failed: ${userError?.message ?? 'no row'}` }
  }

  const { error: friendError } = await supabase.from('ai_friends').insert({
    user_id: user.id,
    persona_key: 'ache',
  })
  if (friendError) {
    return { ok: false, error: `ai_friends insert failed: ${friendError.message}` }
  }

  const { error: profileError } = await supabase
    .from('user_profiles')
    .insert({ user_id: user.id })
  if (profileError) {
    return { ok: false, error: `user_profiles insert failed: ${profileError.message}` }
  }

  return { ok: true }
}
