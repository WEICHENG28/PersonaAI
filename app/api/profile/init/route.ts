import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { initializeUserProfile } from '@/lib/profile/init'

/**
 * POST /api/profile/init — called right after signup to create the three
 * init rows. Idempotent. All input validated with zod (07 §7.6); responses
 * use the { ok, data | error } envelope.
 */
const bodySchema = z.object({
  authId: z.string().uuid(),
  displayName: z.string().trim().min(1).max(20),
})

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: '請求格式不正確' },
      { status: 400 }
    )
  }

  // Only the signed-in owner may init their own rows.
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.id !== parsed.data.authId) {
    return NextResponse.json({ ok: false, error: '未登入或無權限' }, { status: 401 })
  }

  const result = await initializeUserProfile(parsed.data.authId, parsed.data.displayName)
  if (!result.ok) {
    console.error('[profile/init]', result.error)
    return NextResponse.json({ ok: false, error: '初始化失敗，請稍後再試' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, data: null })
}
