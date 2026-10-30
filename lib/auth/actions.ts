'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { initializeUserProfile } from '@/lib/profile/init'

/**
 * Auth server actions — errors are returned as values (vibecodex C5):
 * { ok: false, error: <message key for the UI> }.
 */

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

const registerSchema = credentialsSchema.extend({
  nickname: z.string().trim().min(1).max(20),
})

export type AuthResult = { ok: true } | { ok: false; error: string }

function toErrorKey(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('Invalid login credentials')) return 'errorInvalidCredentials'
  if (message.toLowerCase().includes('already registered')) return 'errorEmailTaken'
  if (message.toLowerCase().includes('password')) return 'errorWeakPassword'
  return 'errorGeneric'
}

export async function loginAction(formData: FormData): Promise<AuthResult> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) return { ok: false, error: 'errorMissingFields' }

  const supabase = createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { ok: false, error: toErrorKey(error) }

  return { ok: true }
}

export async function registerAction(formData: FormData): Promise<AuthResult> {
  const parsed = registerSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    nickname: formData.get('nickname'),
  })
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0]
    if (field === 'password') return { ok: false, error: 'errorWeakPassword' }
    if (field === 'nickname' || field === 'email') return { ok: false, error: 'errorMissingFields' }
    return { ok: false, error: 'errorGeneric' }
  }

  const supabase = createClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { display_name: parsed.data.nickname } },
  })
  if (error) return { ok: false, error: toErrorKey(error) }

  // Idempotent single-writer init (lib/profile/init.ts).
  if (data.user) {
    const init = await initializeUserProfile(data.user.id, parsed.data.nickname)
    if (!init.ok) return { ok: false, error: 'errorGeneric' }
  }

  return { ok: true }
}

export async function logoutAction(): Promise<void> {
  const supabase = createClient()
  await supabase.auth.signOut()
  const locale = await getLocale()
  redirect(locale === 'zh-CN' ? '/login' : `/${locale}/login`)
}
