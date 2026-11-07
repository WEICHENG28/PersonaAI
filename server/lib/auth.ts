/**
 * 后端 JWT 验证（A0b）。从 Authorization: Bearer <jwt> 取出 auth.users。
 */
import type { Context } from 'hono'
import { createHash } from 'node:crypto'
import { getServiceClient } from './supabase.js'
import { authUserCache } from './authCache.js'

export type AuthedUser = {
  authId: string
  email: string
  displayName: string
  /** 被管理員停用（app_metadata.banned）。 */
  banned?: boolean
}

/** 解析 Bearer token；格式不对回 null。 */
export function parseBearer(header: string | undefined): string | null {
  if (!header) return null
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return m?.[1] ?? null
}

/** exp 只決定快取期限；身份與簽章仍須交給 getUser 驗證。 */
function cacheDeadline(jwt: string): number | null {
  try {
    const payload: unknown = JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString('utf8'))
    if (!payload || typeof payload !== 'object' || !('exp' in payload)) return null
    const exp = payload.exp
    if (typeof exp !== 'number' || !Number.isFinite(exp)) return null
    const now = Date.now()
    return exp * 1000 > now ? Math.min(now + 60_000, exp * 1000) : null
  } catch {
    return null
  }
}

/**
 * 用 service role 验证 JWT，回 auth 用户。
 * 不抛错：失败回 null（由路由决定 401 文案）。
 */
export async function resolveAuthUser(jwt: string): Promise<AuthedUser | null> {
  const deadline = cacheDeadline(jwt)
  const key = createHash('sha256').update(jwt).digest('hex')
  const cached = deadline === null ? undefined : authUserCache.get(key)
  if (cached) return { ...cached }
  const generation = authUserCache.generation
  const supabase = getServiceClient()
  const { data, error } = await supabase.auth.getUser(jwt)
  if (error || !data.user) return null
  const email = data.user.email ?? ''
  const metaName = data.user.user_metadata?.display_name
  const displayName =
    typeof metaName === 'string' && metaName.trim()
      ? metaName.trim()
      : email.split('@')[0] || '朋友'
  const user: AuthedUser = { authId: data.user.id, email, displayName, ...(data.user.app_metadata?.banned === true ? { banned: true } : {}) }
  if (deadline !== null && !user.banned && generation === authUserCache.generation) {
    authUserCache.set(key, { ...user }, deadline - Date.now())
  }
  return user
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
  // 防濫用：被停用的帳號什麼都不能做（管理員用 POST /api/admin/ban）
  if (user.banned) {
    return c.json({ ok: false, code: 'banned', error: '这个帐号已被停用。如有疑问请联系我们' }, 403)
  }
  return user
}

export function isAuthFailure(v: AuthedUser | Response): v is Response {
  return v instanceof Response
}
