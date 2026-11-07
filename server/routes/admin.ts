// 管理員 API：看檢舉、停用／恢復帳號（防濫用）、新手漏斗。完整的管理後台頁面之後再做，現在用工具（curl 等）呼叫。
// 要帶 Authorization: Bearer <ADMIN_SECRET>（Vercel 環境變數）；沒設 ADMIN_SECRET 就全部拒絕。擁有者：B。
import { Hono } from 'hono'
import { z } from 'zod'
import { getServiceClient } from '../lib/supabase.js'
import { invalidateAuthUser } from '../lib/authCache.js'
import { REPORT_ACTION } from '../social/safety.js'
import { buildFunnel, loadOnboardingState } from '../social/onboarding.js'
import { recentErrors } from '../lib/alerts.js'
import { deepHealth } from '../health.js'

import { isAdminRequest } from '../lib/adminAuth.js'

export const adminRoutes = new Hono()

adminRoutes.use('/admin/*', async (c, next) => {
  if (!isAdminRequest(c)) return c.json({ ok: false, error: '没有权限' }, 401)
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
  invalidateAuthUser(user.auth_id as string)
  if (body.data.banned) await db.from('users').update({ social_agent_enabled: false }).eq('id', user.id)
  await db.from('agent_logs').insert({
    user_id: user.id,
    agent: 'guard',
    action: body.data.banned ? '管理员停用帐号' : '管理员恢复帐号',
    reason: body.data.reason ?? null,
  })
  return c.json({ ok: true, data: { userId: user.id, name: user.display_name, banned: body.data.banned } })
})

/**
 * 新手漏斗：最近 days 天（預設 30）建立的真人帳號，每一步有多少人走到。
 * 用和新手引導同一套判斷（server/social/onboarding.ts）；一次最多看 500 人。
 */
adminRoutes.get('/admin/funnel', async (c) => {
  const days = Math.min(Math.max(Number(c.req.query('days') ?? 30) || 30, 1), 365)
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const db = getServiceClient()
  const { data, error } = await db.from('users').select('id').eq('is_seed', false).gte('created_at', since).order('created_at', { ascending: false }).limit(500)
  if (error) throw error
  const ids = (data ?? []).map((u) => u.id as string)
  const states = []
  // 10 人一批，避免一次打太多查詢
  for (let i = 0; i < ids.length; i += 10) states.push(...(await Promise.all(ids.slice(i, i + 10).map((id) => loadOnboardingState(id)))))
  return c.json({ ok: true, data: { days, funnel: buildFunnel(states) } })
})

const DAY = 86_400_000

/** 概況：用戶數、24 小時內的使用量、7 天內的檢舉，加上服務健康檢查。 */
adminRoutes.get('/admin/overview', async (c) => {
  const db = getServiceClient()
  const day = new Date(Date.now() - DAY).toISOString()
  const week = new Date(Date.now() - 7 * DAY).toISOString()
  const count = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
    const r = await q
    if (r.error) throw new Error(r.error.message)
    return r.count ?? 0
  }
  const head = { count: 'exact' as const, head: true }
  const [users, newUsers, inLobby, friendMsgs, liveMsgs, tasks, reports, activeRows, health] = await Promise.all([
    count(db.from('users').select('id', head).eq('is_seed', false)),
    count(db.from('users').select('id', head).eq('is_seed', false).gte('created_at', day)),
    count(db.from('users').select('id', head).eq('is_seed', false).eq('social_agent_enabled', true)),
    count(db.from('friend_messages').select('id', head).eq('role', 'user').gte('created_at', day)),
    count(db.from('messages').select('id', head).eq('is_ai', false).gte('created_at', day)),
    count(db.from('agent_tasks').select('id', head).gte('created_at', day)),
    count(db.from('agent_logs').select('id', head).eq('agent', 'guard').eq('action', REPORT_ACTION).gte('created_at', week)),
    db.from('friend_messages').select('user_id').eq('role', 'user').gte('created_at', day).limit(5000),
    deepHealth({ full: true }),
  ])
  if (activeRows.error) throw activeRows.error
  return c.json({
    ok: true,
    data: {
      users,
      newUsers24h: newUsers,
      activeUsers24h: new Set((activeRows.data ?? []).map((r) => r.user_id as string)).size,
      inLobby,
      friendMessages24h: friendMsgs,
      liveMessages24h: liveMsgs,
      tasks24h: tasks,
      reports7d: reports,
      health: { database: health.database, llm: health.llm, missingEnv: Object.entries(health.env).filter(([, v]) => !v).map(([k]) => k) },
    },
  })
})

/** 找用戶（名字包含 q，最多 20 位真人）：帳號狀態、在不在大廳、被檢舉幾次。 */
adminRoutes.get('/admin/users', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 40)
  const db = getServiceClient()
  let query = db.from('users').select('id, auth_id, display_name, social_agent_enabled, created_at').eq('is_seed', false).order('created_at', { ascending: false }).limit(20)
  if (q) query = query.ilike('display_name', `%${q.replace(/[%_]/g, '')}%`)
  const { data, error } = await query
  if (error) throw error
  const rows = await Promise.all(
    (data ?? []).map(async (u) => {
      const [auth, reported, msgs] = await Promise.all([
        u.auth_id ? db.auth.admin.getUserById(u.auth_id as string) : Promise.resolve(null),
        db.from('agent_logs').select('user_id').eq('agent', 'guard').eq('action', REPORT_ACTION).eq('detail->>target_user_id', u.id),
        db.from('friend_messages').select('id', { count: 'exact', head: true }).eq('user_id', u.id).eq('role', 'user'),
      ])
      const meta = auth?.data.user?.app_metadata ?? {}
      return {
        id: u.id,
        name: u.display_name,
        createdAt: u.created_at,
        inLobby: Boolean(u.social_agent_enabled),
        guest: meta.guest === true,
        hasPassword: meta.has_password === true,
        banned: meta.banned === true,
        reportedBy: new Set((reported.data ?? []).map((r) => r.user_id as string)).size,
        friendMessages: msgs.count ?? 0,
      }
    }),
  )
  return c.json({ ok: true, data: rows })
})

/** 最近的錯誤（這台伺服器記得的，最多 50 筆；完整紀錄在 Vercel Logs）。 */
adminRoutes.get('/admin/errors', (c) => c.json({ ok: true, data: recentErrors() }))
