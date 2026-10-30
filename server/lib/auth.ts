/**
 * 后端 JWT 验证（A0b）。从 Authorization: Bearer <jwt> 取出 auth.users。
 */
import type { Context } from 'hono'
import { getServiceClient } from './supabase'

export type AuthedUser = {
  authId: string
  email: string
  displayName: string
}

/** 解析 Bearer token；格式不对回 null。 */
export function parseBearer(header: string | undefined): string | null {
  if (!header) return null
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return m?.[1] ?? null
}

/**
 * 用 service role 验证 JWT，回 auth 用户。
 * 不抛错：失败回 null（由路由决定 401 文案）。
 */
export async function resolveAuthUser(jwt: string): Promise<AuthedUser | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase.auth.getUser(jwt)
  if (error || !data.user) return null
  const email = data.user.email ?? ''
  const metaName = data.user.user_metadata?.display_name
  const displayName =
    typeof metaName === 'string' && metaName.trim()
      ? metaName.trim()
      : email.split('@')[0] || '朋友'
  return { authId: data.user.id, email, displayName }
}

/**
 * Hono 辅助：成功回 AuthedUser；失败回已写好的 401 Response。
 */
export async function requireAuth(
  c: Context,
): Promise<AuthedUser | Response> {
  const jwt = parseBearer(c.req.header('Authorization'))
  if (!jwt) {
    return c.json({ ok: false, error: '请先登录' }, 401)
  }
  const user = await resolveAuthUser(jwt)
  if (!user) {
    return c.json({ ok: false, error: '登录已过期，请重新登录' }, 401)
  }
  return user
}

export function isAuthFailure(v: AuthedUser | Response): v is Response {
  return v instanceof Response
}
