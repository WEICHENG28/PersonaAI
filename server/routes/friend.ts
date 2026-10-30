// A 線的 API 路由，掛在 /api 底下（例如 friendRoutes.get('/xxx') → GET /api/xxx）。擁有者：A。
// 回應格式：成功 { ok: true, data }，失敗 { ok: false, error: '给用户看的简体中文讯息' }。
import { Hono } from 'hono'
import { isAuthFailure, requireAuth } from '../lib/auth'
import { initUserProfile } from '../lib/profile'

export const friendRoutes = new Hono()

/**
 * POST /api/profile/init
 * 登录后调用一次：在 users 表建行（幂等）。需 Bearer JWT。
 */
friendRoutes.post('/profile/init', async (c) => {
  const authed = await requireAuth(c)
  if (isAuthFailure(authed)) return authed

  try {
    const data = await initUserProfile(authed)
    return c.json({ ok: true, data })
  } catch (err) {
    console.error('[friend] profile/init', err)
    return c.json({ ok: false, error: '初始化档案失败，请稍后再试' }, 500)
  }
})
