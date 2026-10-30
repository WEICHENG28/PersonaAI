// A 緣 API 路由（/api 底下）。擁有者：A。
// 回應格式：成功 { ok: true, data }，失敗 { ok: false, error: '给用户看的简体中文讯息' }。
import { Hono } from 'hono'
import { isAuthFailure, requireAuth } from '../lib/auth'
import { initUserProfile } from '../lib/profile'
import { friendChat, friendIntro, getFriendMessages, FriendChatError } from '../friend/chat'

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
