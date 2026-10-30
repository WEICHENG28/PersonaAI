// A 緣 API 路由（/api 底下）。擁有者：A。
// 回應格式：成功 { ok: true, data }，失敗 { ok: false, error: '给用户看的简体中文讯息' }。
import { Hono } from 'hono'
import { z } from 'zod'
import { isAuthFailure, requireAuth } from '../lib/auth'
import { initUserProfile } from '../lib/profile'
import { friendChat, friendIntro, getFriendMessages, nextMeet, FriendChatError, NextMeetError } from '../friend/chat'
import { deleteMemory, listMemories, markNotLikeMe, memoryIdSchema, MemoryError } from '../friend/memory'
import {
  extractProfile,
  getShareableView,
  updateShareable,
  shareableUpdateSchema,
  ProfileError,
} from '../friend/profile'

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

/**
 * POST /api/friend/intro
 * 首次见面：intro + 第一个轻事件开场（幂等，intro_done 已 true 则直接 ok）。
 */
friendRoutes.post('/friend/intro', async (c) => {
  const authed = await requireAuth(c)
  if (isAuthFailure(authed)) return authed

  try {
    await friendIntro(await appUserId(authed))
    return c.json({ ok: true, data: null })
  } catch (err) {
    console.error('[friend] intro', err)
    return c.json({ ok: false, error: err instanceof FriendChatError ? err.message : '阿澈还没准备好，再试一次？' }, 500)
  }
})

/**
 * POST /api/friend/chat
 * body { text }：存用户讯息 → Prompt 1 → 回复；task_intent 时建任务卡。
 */
friendRoutes.post('/friend/chat', async (c) => {
  const authed = await requireAuth(c)
  if (isAuthFailure(authed)) return authed

  let userId: string
  try {
    userId = await appUserId(authed)
  } catch (err) {
    console.error('[friend] chat userId', err)
    return c.json({ ok: false, error: '初始化档案失败，请稍后再试' }, 500)
  }

  try {
    const result = await friendChat(userId, await c.req.json().then((b) => b?.text ?? '').catch(() => ''))
    return c.json({ ok: true, data: result })
  } catch (err) {
    if (err instanceof FriendChatError) {
      return c.json({ ok: false, error: err.message }, 500)
    }
    // zod: 文字长度
    if (err && typeof err === 'object' && 'issues' in err) {
      return c.json({ ok: false, error: '讯息要 1–1000 字' }, 400)
    }
    console.error('[friend] chat', err)
    return c.json({ ok: false, error: '阿澈刚刚恍神了，再说一次？' }, 500)
  }
})

/**
 * GET /api/friend/messages
 * 拉一次聊天记录（id/role/kind/content/meta/created_at）。
 */
friendRoutes.get('/friend/messages', async (c) => {
  const authed = await requireAuth(c)
  if (isAuthFailure(authed)) return authed

  try {
    const userId = await appUserId(authed)
    const data = await getFriendMessages(userId)
    return c.json({ ok: true, data })
  } catch (err) {
    console.error('[friend] messages', err)
    return c.json({ ok: false, error: err instanceof FriendChatError ? err.message : '读取聊天记录失败' }, 500)
  }
})

/**
 * GET /api/memory
 * 「它记得的事」：未删除的记忆，新→旧。
 */
friendRoutes.get('/memory', async (c) => {
  const authed = await requireAuth(c)
  if (isAuthFailure(authed)) return authed
  try {
    const userId = await appUserId(authed)
    const data = await listMemories(userId)
    return c.json({ ok: true, data })
  } catch (err) {
    console.error('[friend] memory list', err)
    return c.json({ ok: false, error: err instanceof MemoryError ? err.message : '读取记忆失败' }, 500)
  }
})

/**
 * DELETE /api/memory/:id
 * 软删除（deleted_at）。
 */
friendRoutes.delete('/memory/:id', async (c) => {
  const authed = await requireAuth(c)
  if (isAuthFailure(authed)) return authed
  const id = c.req.param('id')
  if (!memoryIdSchema.safeParse(id).success) {
    return c.json({ ok: false, error: '记忆编号格式不对' }, 400)
  }
  try {
    const userId = await appUserId(authed)
    const ok = await deleteMemory(userId, id)
    if (!ok) return c.json({ ok: false, error: '找不到这条记忆' }, 404)
    return c.json({ ok: true, data: null })
  } catch (err) {
    console.error('[friend] memory delete', err)
    return c.json({ ok: false, error: '删除失败，请再试一次' }, 500)
  }
})

/**
 * POST /api/memory/:id/not-like-me
 * 「这不太像我」：等同删除＋日志。
 */
friendRoutes.post('/memory/:id/not-like-me', async (c) => {
  const authed = await requireAuth(c)
  if (isAuthFailure(authed)) return authed
  const id = c.req.param('id')
  if (!memoryIdSchema.safeParse(id).success) {
    return c.json({ ok: false, error: '记忆编号格式不对' }, 400)
  }
  try {
    const userId = await appUserId(authed)
    const ok = await markNotLikeMe(userId, id)
    if (!ok) return c.json({ ok: false, error: '找不到这条记忆' }, 404)
    return c.json({ ok: true, data: null })
  } catch (err) {
    console.error('[friend] memory not-like-me', err)
    return c.json({ ok: false, error: '操作失败，请再试一次' }, 500)
  }
})

/**
 * GET /api/profile
 * 对外档案与确认状态。绝不回 agent_profile（Big Five）。
 */
friendRoutes.get('/profile', async (c) => {
  const authed = await requireAuth(c)
  if (isAuthFailure(authed)) return authed
  try {
    const userId = await appUserId(authed)
    const data = await getShareableView(userId)
    return c.json({ ok: true, data })
  } catch (err) {
    console.error('[friend] profile get', err)
    return c.json({ ok: false, error: err instanceof ProfileError ? err.message : '读取档案失败' }, 500)
  }
})

/**
 * PUT /api/profile/shareable
 * 用户修改并确认对外档案（shareable_confirmed = true）。
 */
friendRoutes.put('/profile/shareable', async (c) => {
  const authed = await requireAuth(c)
  if (isAuthFailure(authed)) return authed
  try {
    const userId = await appUserId(authed)
    const body = await c.req.json().catch(() => null)
    const input = shareableUpdateSchema.parse(body)
    const data = await updateShareable(userId, input)
    return c.json({ ok: true, data })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ ok: false, error: '档案字段格式不对：介绍 40 字内、兴趣 1–12 项、风格与想找各 60 字内' }, 400)
    }
    console.error('[friend] profile shareable', err)
    return c.json({ ok: false, error: err instanceof ProfileError ? err.message : '保存档案失败，请再试一次' }, 500)
  }
})

/**
 * POST /api/profile/extract
 * 手动触发档案撷取（Prompt 3）。
 */
friendRoutes.post('/profile/extract', async (c) => {
  const authed = await requireAuth(c)
  if (isAuthFailure(authed)) return authed
  try {
    const userId = await appUserId(authed)
    const data = await extractProfile(userId)
    return c.json({ ok: true, data })
  } catch (err) {
    console.error('[friend] profile extract', err)
    return c.json({ ok: false, error: err instanceof ProfileError ? err.message : '档案更新失败，稍后再试' }, 500)
  }
})

/**
 * POST /api/friend/next-meet
 * A5：模拟下次见面（Demo 用按钮触发）。
 */
friendRoutes.post('/friend/next-meet', async (c) => {
  const authed = await requireAuth(c)
  if (isAuthFailure(authed)) return authed

  try {
    const userId = await appUserId(authed)
    await nextMeet(userId)
    return c.json({ ok: true, data: null })
  } catch (err) {
    console.error('[friend] next-meet', err)
    return c.json({ ok: false, error: err instanceof NextMeetError ? err.message : '模拟下次见面失败，请再试一次' }, 500)
  }
})

/** auth.users id → public.users id（profile/init 已保证有行）。 */
async function appUserId(authed: { authId: string }): Promise<string> {
  const { getServiceClient } = await import('../lib/supabase')
  const db = getServiceClient()
  const { data, error } = await db
    .from('users')
    .select('id')
    .eq('auth_id', authed.authId)
    .single()
  if (error || !data) throw new Error(`找不到用户：${error?.message ?? 'no row'}`)
  return data.id as string
}
