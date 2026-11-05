// 管理員 API（防濫用）：看檢舉、停用／恢復帳號。完整的管理後台頁面之後再做，現在用工具（curl 等）呼叫。
// 要帶 Authorization: Bearer <ADMIN_SECRET>（Vercel 環境變數）；沒設 ADMIN_SECRET 就全部拒絕。擁有者：B。
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { getServiceClient } from '../lib/supabase.js'
import { REPORT_ACTION } from '../social/safety.js'

export const adminRoutes = new Hono()

function isAdmin(c: Context): boolean {
  const secret = process.env.ADMIN_SECRET
  return Boolean(secret && secret.length >= 16 && c.req.header('Authorization') === `Bearer ${secret}`)
}

adminRoutes.use('/admin/*', async (c, next) => {
  if (!isAdmin(c)) return c.json({ ok: false, error: '没有权限' }, 401)
  await next()
})

/** 最近的檢舉（誰檢舉誰、理由、哪段對話），新的在前。 */
adminRoutes.get('/admin/reports', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 50) || 50, 200)
  const db = getServiceClient()
  const { data, error } = await db
    .from('agent_logs')
    .select('user_id, reason, conversation_id, detail, created_at')
    .eq('agent', 'guard')
    .eq('action', REPORT_ACTION)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  const ids = [...new Set((data ?? []).flatMap((r) => [r.user_id as string, (r.detail as { target_user_id?: string })?.target_user_id ?? '']))].filter(Boolean)
  const { data: users } = await db.from('users').select('id, display_name').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  const name = new Map((users ?? []).map((u) => [u.id as string, u.display_name as string]))
  return c.json({
    ok: true,
    data: (data ?? []).map((r) => {
      const d = (r.detail ?? {}) as { target_user_id?: string; note?: string }
      return {
        at: r.created_at,
        reporter: { id: r.user_id, name: name.get(r.user_id as string) ?? null },
        target: { id: d.target_user_id ?? null, name: d.target_user_id ? (name.get(d.target_user_id) ?? null) : null },
        reason: r.reason,
        note: d.note ?? null,
        conversationId: r.conversation_id,
      }
    }),
  })
})

const banBody = z.object({
  userId: z.uuid().optional(),
  name: z.string().trim().min(1).max(40).optional(),
  banned: z.boolean(),
  reason: z.string().max(200).optional(),
})

/** 停用（banned=true）或恢復（false）帳號。用 users.id 或名字指定。停用＝不能登入、所有 API 回 403、從大廳隱藏。 */
adminRoutes.post('/admin/ban', async (c) => {
  const body = banBody.safeParse(await c.req.json().catch(() => null))
  if (!body.success || (!body.data.userId && !body.data.name)) return c.json({ ok: false, error: '要给 userId 或 name，以及 banned' }, 400)
  const db = getServiceClient()
  const q = db.from('users').select('id, auth_id, display_name, is_seed')
  const { data: rows, error } = body.data.userId ? await q.eq('id', body.data.userId) : await q.eq('display_name', body.data.name!).eq('is_seed', false)
  if (error) throw error
  if (!rows?.length) return c.json({ ok: false, error: '找不到这个用户' }, 404)
  if (rows.length > 1) return c.json({ ok: false, error: '有多个同名用户，请改用 userId', data: rows.map((r) => ({ id: r.id, name: r.display_name })) }, 409)
  const user = rows[0]!
  if (!user.auth_id) return c.json({ ok: false, error: '示范用户没有帐号，不能停用' }, 400)

  const { error: authError } = await db.auth.admin.updateUserById(user.auth_id as string, {
    ban_duration: body.data.banned ? '876000h' : 'none',
    app_metadata: { banned: body.data.banned },
  })
  if (authError) throw authError
  if (body.data.banned) await db.from('users').update({ social_agent_enabled: false }).eq('id', user.id)
  await db.from('agent_logs').insert({
    user_id: user.id,
    agent: 'guard',
    action: body.data.banned ? '管理员停用帐号' : '管理员恢复帐号',
    reason: body.data.reason ?? null,
  })
  return c.json({ ok: true, data: { userId: user.id, name: user.display_name, banned: body.data.banned } })
})
