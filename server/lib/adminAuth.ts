import type { Context } from 'hono'

/** 与管理后台共用验证；未设置或过短的 secret 一律拒绝。 */
export function isAdminRequest(c: Context): boolean {
  const secret = process.env.ADMIN_SECRET
  return Boolean(secret && secret.length >= 16 && c.req.header('Authorization') === `Bearer ${secret}`)
}
