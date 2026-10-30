/**
 * 确保 public.users 有对应 auth 用户的行（幂等）。A0b。
 * users.id 是 app 内用户 id；auth_id 链到 auth.users。
 */
import { z } from 'zod'
import type { AuthedUser } from './auth'
import { getServiceClient } from './supabase'

const InitResultSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string(),
  created: z.boolean(),
})

export type InitProfileResult = z.infer<typeof InitResultSchema>

export async function initUserProfile(authed: AuthedUser): Promise<InitProfileResult> {
  const supabase = getServiceClient()

  // 已有行：直接回
  const existing = await supabase
    .from('users')
    .select('id, display_name')
    .eq('auth_id', authed.authId)
    .maybeSingle()

  if (existing.error) {
    throw new Error(`查用户失败：${existing.error.message}`)
  }

  if (existing.data) {
    return InitResultSchema.parse({
      userId: existing.data.id,
      displayName: existing.data.display_name,
      created: false,
    })
  }

  // 新建
  const inserted = await supabase
    .from('users')
    .insert({
      auth_id: authed.authId,
      display_name: authed.displayName,
    })
    .select('id, display_name')
    .single()

  if (inserted.error) {
    // 并发注册时可能撞 unique：再查一次
    if (inserted.error.code === '23505') {
      const again = await supabase
        .from('users')
        .select('id, display_name')
        .eq('auth_id', authed.authId)
        .single()
      if (again.data) {
        return InitResultSchema.parse({
          userId: again.data.id,
          displayName: again.data.display_name,
          created: false,
        })
      }
    }
    throw new Error(`创建用户失败：${inserted.error.message}`)
  }

  return InitResultSchema.parse({
    userId: inserted.data.id,
    displayName: inserted.data.display_name,
    created: true,
  })
}
