/**
 * A 线 API 层（docs/10 §3）：同一函数依 VITE_API_MODE 回传 mock 或打 /api。
 * A0b 先接：登录/注册/登出 + profile/init。
 */
import { supabase, isHttpMode } from '../../src/lib/supabase'
import type { User } from './types'
import type { TaskReport, ShareableProfile, AgentProfile, StyleProfile } from '../../shared/types'
import { getServiceClient } from '../lib/supabase'
import { getProfileRow } from '../friend/profile'
import { fakeShareable, fakeAgentProfile, fakeStyle } from '../fixtures/friend'

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
    console.warn('[friend] profile/init 失败', res.status)
  }
}

export interface ShareableView {
  shareable: { intro: string; interests: string[]; chat_style: string; looking_for: string } | null
  confirmed: boolean
  exists: boolean
}

export interface ShareableInput {
  intro: string
  interests: string[]
  chat_style: string
  looking_for: string
}

async function apiCall<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await fetch(path, {
    ...init,
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const body = (await res.json().catch(() => null)) as { ok: boolean; data?: T; error?: string } | null
  if (!res.ok || !body?.ok) throw new ProfileApiError(body?.error ?? '出了点问题，再试一次？')
  return body.data as T
}

/** GET /api/profile：对外档案与确认状态（不含 Big Five）。mock 模式回 null（页面用 demo store）。 */
export async function fetchProfile(): Promise<ShareableView | null> {
  if (!isHttpMode) return null
  return apiCall<ShareableView>('/api/profile')
}

/** PUT /api/profile/shareable：修改并确认。 */
export async function saveShareable(input: ShareableInput): Promise<ShareableView> {
  return apiCall<ShareableView>('/api/profile/shareable', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

/** POST /api/profile/extract：手动撷取（Prompt 3 重新生成）。 */
export async function requestExtractProfile(): Promise<ShareableView> {
  return apiCall<ShareableView>('/api/profile/extract', { method: 'POST' })
}

export class ProfileApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProfileApiError'
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

/** POST /api/friend/next-meet：模拟时间经过，阿澈分享新近况并回报任务结果。 */
export async function triggerNextMeet(): Promise<void> {
  if (!isHttpMode) {
    console.log('[friend] mock 模式：模拟下次见面由 demo store 处理')
    return
  }
  await apiCall<null>('/api/friend/next-meet', { method: 'POST' })
}

/**
 * A6：deliverReport - 新增 friend_report 通知，下次见面时由 AI 朋友回报。
 * B 的任务完成后呼叫。
 */
export async function deliverReport(userId: string, report: TaskReport): Promise<void> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('[deliverReport] 无 DB 设定，跳过通知写入')
    return
  }
  const db = getServiceClient()
  const { error } = await db.from('notifications').insert({
    user_id: userId,
    type: 'friend_report',
    payload: report as unknown as Record<string, unknown>,
  })
  if (error) {
    console.error('[deliverReport] 写入通知失败', error.message)
    throw new Error(`写入回报通知失败：${error.message}`)
  }
}

/**
 * A4：對外檔案讀取（B 的 planner 與 C 的卡片生成會用）。
 * 無 DB 設定時回 fixtures；有 DB 但庫中無值回 null。
 */
export async function getShareableProfile(userId: string): Promise<ShareableProfile | null> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fakeShareable
  }
  const row = await getProfileRow(userId)
  return row?.shareable_profile ?? null
}

export async function getAgentProfile(userId: string): Promise<AgentProfile | null> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fakeAgentProfile
  }
  const row = await getProfileRow(userId)
  if (!row?.agent_profile) return null
  return JSON.parse(JSON.stringify(row.agent_profile))
}

export async function getStyleProfile(userId: string): Promise<StyleProfile | null> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fakeStyle
  }
  const row = await getProfileRow(userId)
  return row?.agent_profile?.style ?? null
}

export { isHttpMode }