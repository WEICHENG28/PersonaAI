import { appUserIdCache } from './authCache.js'
import { getServiceClient } from './supabase.js'

/** auth.users.id → public.users.id；只有成功查到的 id 快取五分鐘。 */
export async function findAppUserId(authId: string): Promise<string | null> {
  const cached = appUserIdCache.get(authId)
  if (cached !== undefined) return cached
  const generation = appUserIdCache.generation
  const { data, error } = await getServiceClient()
    .from('users').select('id').eq('auth_id', authId).maybeSingle()
  if (error) throw error
  const id = data?.id as string | undefined
  if (!id) return null
  if (generation === appUserIdCache.generation) appUserIdCache.set(authId, id, 5 * 60_000)
  return id
}
