/**
 * A 线 API 层（docs/10 §3）：同一函数依 VITE_API_MODE 回传 mock 或打 /api。
 * A0b 先接：登录/注册/登出 + profile/init。
 */
import { supabase, isHttpMode } from '../supabase'
import type { User } from './types'

/** 匿名登录：不用邮箱密码，只带昵称（需在 Supabase 开启 Allow anonymous sign-ins）。 */
export async function loginAnonymously(nickname: string): Promise<User> {
  const { data, error } = await supabase.auth.signInAnonymously({
    options: { data: { display_name: nickname } },
  })
  if (error) throw new AuthError(error.message)
  const authUser = data.user
  if (!authUser) throw new AuthError('登录未返回用户')
  return toUser(authUser.id, '', nickname)
}

/** 注册：Supabase Auth signUp（meta 带昵称）。 */
export async function register(email: string, password: string, nickname: string): Promise<User> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: nickname } },
  })
  if (error) throw new AuthError(error.message)
  const authUser = data.user
  if (!authUser) throw new AuthError('注册未返回用户')
  return toUser(authUser.id, authUser.email ?? email, nickname)
}

/** 登录：Supabase Auth signInWithPassword。 */
export async function login(email: string, password: string): Promise<User> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new AuthError(error.message)
  const authUser = data.user
  if (!authUser) throw new AuthError('登录未返回用户')
  const nickname = (authUser.user_metadata?.display_name as string | undefined) ?? email.split('@')[0] ?? '朋友'
  return toUser(authUser.id, authUser.email ?? email, nickname)
}

/** 登出。 */
export async function logout(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw new AuthError(error.message)
}

/** 目前登录者（重整后还原 session 用）；无 session 回 null。 */
export async function currentUser(): Promise<User | null> {
  const { data } = await supabase.auth.getUser()
  const authUser = data.user
  if (!authUser) return null
  const email = authUser.email ?? ''
  const nickname = (authUser.user_metadata?.display_name as string | undefined) ?? email.split('@')[0] ?? '朋友'
  return toUser(authUser.id, email, nickname)
}

/** 登录后调一次：确保 users 表有行（幂等）。 */
export async function initProfile(): Promise<void> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return
  const res = await fetch('/api/profile/init', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    // 不致命：mock/演示模式可继续
    console.warn('[friend] profile/init 失败', res.status)
  }
}

function toUser(id: string, email: string, nickname: string): User {
  return { id, email, nickname }
}

/** Auth 相关错误（讯息已转成给用户看的简体中文）。 */
export class AuthError extends Error {
  constructor(message: string) {
    super(toZh(message))
    this.name = 'AuthError'
  }
}

/** Supabase 英文错误 → 简体中文给用户看。 */
function toZh(message: string): string {
  if (/invalid login credentials/i.test(message)) return '邮箱或密码不正确'
  if (/user already registered|already been registered/i.test(message)) return '这个邮箱已经注册过了'
  if (/password should be at least/i.test(message)) return '密码至少要 6 个字符'
  if (/email not confirmed/i.test(message)) return '邮箱尚未验证，请查收邮件'
  if (/anonymous sign-ins are disabled/i.test(message)) return '暂时无法直接开始：请在 Supabase 开启匿名登录'
  return '出了点问题，再试一次？'
}

export { isHttpMode }
