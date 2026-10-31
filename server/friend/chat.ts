/**
 * A2：AI 朋友聊天。擁有者：A。
 * 依賴：A1 persona（已併）、B0 llm（已併）、B1 createTaskFromText（已併，內部 LLM 失敗會拋 TaskError）。
 * A3（記憶擷取）已併：流程第 6 步背景執行 extractMemories。
 */
import { z } from 'zod'
import { getServiceClient } from '../lib/supabase.js'
import { llmJson } from '../lib/llm/index.js'
import { CONFIG } from '../lib/config.js'
import { writeLog } from '../lib/log.js'
import { createTaskFromText } from '../../server/social/task.js'
import { friendReplySchema, renderFriendSystem } from '../prompts/01_friend.js'
import { ACHE, EVENTS, LIFE_UPDATES, getLifeUpdate, pickNextEvent } from './persona.js'
import { extractMemories } from './memory.js'
import { extractProfile, shouldExtractProfile } from './profile.js'

export interface FriendRow {
  story_stage: number
  life_state: { mood: string; doing: string } | null
  shared_event_ids: string[]
  intro_done: boolean
}

interface MessageRow {
  role: 'user' | 'friend'
  kind: string
  content: string
}

/** LLM 失敗或 500 時，前端顯示「阿澈剛剛恍神了，再說一次？」的統一錯誤。 */
export class FriendChatError extends Error {
  constructor(message = '阿澈刚刚恍神了，再说一次？') {
    super(message)
    this.name = 'FriendChatError'
  }
}

export const chatBodySchema = z.object({ text: z.string().trim().min(1).max(1000) })
export const nudgeBodySchema = z.object({ text: z.string().trim().max(1000).optional() })

/** 確保 users/ai_friends 有行（冪等；A0b 的 profile/init 只建 users）。 */
export async function ensureFriendRow(userId: string): Promise<FriendRow> {
  const db = getServiceClient()
  const { data: existing, error: qErr } = await db
    .from('ai_friends')
    .select('story_stage, life_state, shared_event_ids, intro_done')
    .eq('user_id', userId)
    .maybeSingle()
  if (qErr) throw new FriendChatError(`查询朋友状态失败：${qErr.message}`)
  if (existing) return existing as FriendRow

  const init = {
    story_stage: 0,
    life_state: { ...getLifeUpdate(0) },
    shared_event_ids: [] as string[],
    intro_done: false,
  }
  const { data: created, error: iErr } = await db
    .from('ai_friends')
    .insert({ user_id: userId, ...init })
    .select('story_stage, life_state, shared_event_ids, intro_done')
    .single()
  if (iErr) {
    if (iErr.code === '23505') {
      // 併發：再查一次
      const again = await db
        .from('ai_friends')
        .select('story_stage, life_state, shared_event_ids, intro_done')
        .eq('user_id', userId)
        .single()
      if (again.data) return again.data as FriendRow
    }
    throw new FriendChatError(`初始化朋友失败：${iErr.message}`)
  }
  return created as FriendRow
}

/** 首次見面：intro 訊息＋第一個輕事件開場，設 intro_done。（POST /api/friend/intro） */
export async function friendIntro(userId: string): Promise<void> {
  const db = getServiceClient()
  const friend = await ensureFriendRow(userId)
  if (friend.intro_done) return

  const firstEvent = pickNextEvent(friend.story_stage, friend.shared_event_ids)
  const rows = [
    { user_id: userId, role: 'friend', kind: 'intro', content: ACHE.intro, meta: {} },
    ...(firstEvent ? [{ user_id: userId, role: 'friend', kind: 'chat', content: firstEvent.line, meta: { event_id: firstEvent.id } }] : []),
  ]
  const { error } = await db.from('friend_messages').insert(rows)
  if (error) throw new FriendChatError(`写入开场失败：${error.message}`)

  await db.from('ai_friends').update({ intro_done: true }).eq('user_id', userId)
  await writeLog({
    user_id: userId,
    agent: 'friend',
    action: '首次见面',
    reason: firstEvent ? `分享事件 ${firstEvent.id}` : '无事件可分享',
  })
}

/** 主流程：POST /api/friend/chat。回傳給前端的訊息（含 task_card）。
 *  mode='nudge'：用户沉默后阿澈主动接话，不保存用户消息，text 可为空。
 */
export async function friendChat(userId: string, text: string, mode?: 'nudge') {
  const db = getServiceClient()
  const isNudge = mode === 'nudge'
  // nudge 模式允许 text 为空；普通模式校验 1-1000 字
  const body = isNudge
    ? { text: text || '（阿澈主动接话）' }
    : chatBodySchema.parse({ text })
  const friend = await ensureFriendRow(userId)

  // 1. 存用户讯息（nudge 模式不保存用户消息，阿澈主动开口）
  if (!isNudge) {
    const { error: uErr } = await db
      .from('friend_messages')
      .insert({ user_id: userId, role: 'user', kind: 'chat', content: body.text, meta: {} })
    if (uErr) throw new FriendChatError(`保存讯息失败：${uErr.message}`)
  }

  // 2. 组上下文
  const lifeState = friend.life_state ?? getLifeUpdate(friend.story_stage)
  const lifeText = `${lifeState.mood}；${lifeState.doing}`
  const nextEvent = pickNextEvent(friend.story_stage, friend.shared_event_ids)
  const { data: history } = await db
    .from('friend_messages')
    .select('role, kind, content')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(CONFIG.FRIEND_HISTORY_LIMIT * 2) // 取宽一点再裁最近 N 则
  const recent = (history ?? []).slice(-CONFIG.FRIEND_HISTORY_LIMIT) as MessageRow[]
  const recentText = recent.map((m) => `${m.role === 'user' ? '用户' : '阿澈'}：${m.content}`).join('\n')
  // A3 未實作：記憶先空（鉤子註明）
  const memoriesText = '（还没有长期记忆）'

  // 3. 呼叫 Prompt 1
  const system = renderFriendSystem({
    lifeState: lifeText,
    eventText: nextEvent?.line ?? '无',
    recallMemory: '无',
    memories: memoriesText,
    crisisResource: CONFIG.CRISIS_RESOURCE,
  })
  // nudge 模式：告诉 LLM 这是主动接话，不是用户发来的消息
  const userContent = isNudge
    ? `[mode: nudge] 用户停止回复了一段时间，现在请阿澈主动接话，分享一件和最近话题相关的事或问一个轻松的问题。上下文：\n${recentText || '（还没有聊天记录）'}`
    : recentText || body.text
  const reply = await llmJson({
    role: 'chat',
    system,
    messages: [{ role: 'user', content: userContent }],
    temperature: 0.8,
    schema: friendReplySchema,
  })

  // 4. 存回复；shared_event_id 记入 ai_friends
  const { error: rErr } = await db
    .from('friend_messages')
    .insert({ user_id: userId, role: 'friend', kind: 'chat', content: reply.reply, meta: reply.shared_event_id ? { event_id: reply.shared_event_id } : {} })
  if (rErr) throw new FriendChatError(`保存回复失败：${rErr.message}`)

  if (reply.shared_event_id && EVENTS.some((e) => e.id === reply.shared_event_id)) {
    await db
      .from('ai_friends')
      .update({ shared_event_ids: [...friend.shared_event_ids, reply.shared_event_id!] })
      .eq('user_id', userId)
  }

  // 5. task_intent → B 的 createTaskFromText + task_card 消息
  let taskId: string | null = null
  if (reply.task_intent) {
    try {
      const task = await createTaskFromText(userId, body.text)
      taskId = task.id
      await db.from('friend_messages').insert({
        user_id: userId,
        role: 'friend',
        kind: 'task_card',
        content: task.restatement ?? body.text,
        meta: { taskId: task.id },
      })
    } catch (err) {
      // B 的解析失败不中断聊天，只写日志
      console.error('[friend] createTask failed', err)
      await writeLog({ user_id: userId, agent: 'friend', action: '交办任务失败', reason: String(err) })
    }
  }

  // 7. 写日志
  await writeLog({
    user_id: userId,
    agent: 'friend',
    action: '回应用户',
    reason: reply.shared_event_id ? `分享事件 ${reply.shared_event_id}` : '接住用户的话题',
    detail: taskId ? { taskId } : undefined,
  })

  // 6. 背景（不等待）：A3 记忆撷取；A4 用户讯息数是 PROFILE_EXTRACT_EVERY 倍数时撷取档案。
  //    失败只记日志，不影响回复。
  void extractMemories(userId, body.text).catch((err) => {
    console.error('[friend] extractMemories failed', err)
  })
  try {
    const userCount = recent.filter((m) => m.role === 'user').length
    if (shouldExtractProfile(userCount)) {
      void extractProfile(userId).catch((err) => {
        console.error('[friend] extractProfile failed', err)
        writeLog({ user_id: userId, agent: 'friend', action: '撷取用户档案', reason: `背景撷取失败：${String(err)}` }).catch(() => {})
      })
    }
  } catch {
    // 触发判断失败不影响主流程
  }

  return { reply: reply.reply, taskId, sharedEventId: reply.shared_event_id }
}

/** 取聊天记录（前端拉一次用；Realtime 由前端订阅，A 线后续接）。 */
export async function getFriendMessages(userId: string, limit = CONFIG.FRIEND_HISTORY_LIMIT * 2) {
  const db = getServiceClient()
  const { data, error } = await db
    .from('friend_messages')
    .select('id, role, kind, content, meta, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) throw new FriendChatError(`读取聊天记录失败：${error.message}`)
  return data ?? []
}

/** 给 ensureFriendRow 用的 LIFE_UPDATES 引用（避免 tree-shake 问题，导出确认）。 */
export { LIFE_UPDATES }
