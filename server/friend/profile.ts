/**
 * A4：用户档案撷取与确认。拥有者：A。
 * extractProfile：用户讯息（最新 60 则 role user）＋上一版 → Prompt 3（MODEL_REASON）
 *   → 写 user_profiles.shareable_profile／agent_profile
 *   → shareable 内容有变时 shareable_confirmed 归 false、card 清 null（让 C 重产卡片）
 *   → embed(shareableToText) 写 embedding。
 * API：GET /api/profile（只回 shareable 与确认状态）、PUT /api/profile/shareable、POST /api/profile/extract。
 */
import { z } from 'zod'
import { getServiceClient } from '../lib/supabase'
import { llmJson, embed } from '../lib/llm'
import { writeLog } from '../lib/log'
import { CONFIG } from '../lib/config'
import {
  renderProfileSystem,
  profileExtractSchema,
  PROFILE_USER_LINES_LIMIT,
  type ProfileExtract,
} from '../prompts/03_profile'
import type { ShareableProfile, AgentProfile } from '../../shared/types'
import { shareableToSimplified } from '../lib/zh'

export class ProfileError extends Error {
  constructor(message = '档案更新失败，稍后再试') {
    super(message)
    this.name = 'ProfileError'
  }
}

export interface ProfileRow {
  shareable_profile: ShareableProfile | null
  shareable_confirmed: boolean
  agent_profile: AgentProfile | null
  embedding: number[] | null
}

/** 用户可见的对外档案视图（不含 agent_profile／Big Five）。 */
export interface ShareableView {
  shareable: ShareableProfile | null
  confirmed: boolean
  exists: boolean
}

/** 07A A4 第 4 步：把 intro、interests、chat_style、looking_for 串成一段文字给 embed()。 */
export function shareableToText(p: ShareableProfile): string {
  return [
    `简介：${p.intro}`,
    `兴趣：${p.interests.join('、')}`,
    `聊天风格：${p.chat_style}`,
    `想找：${p.looking_for}`,
  ].join('\n')
}

/** shareable 内容是否变了（字段逐一比对；interests 顺序不同视为相同）。 */
export function shareableChanged(a: ShareableProfile | null, b: ShareableProfile | null): boolean {
  if (!a || !b) return true
  const sameSet = (x: string[], y: string[]) =>
    x.length === y.length && [...x].sort().join('\u0000') === [...y].sort().join('\u0000')
  return (
    a.intro !== b.intro ||
    !sameSet(a.interests, b.interests) ||
    a.chat_style !== b.chat_style ||
    a.looking_for !== b.looking_for
  )
}

/** 读当前 user_profiles 行（无行回 null）。 */
export async function getProfileRow(userId: string): Promise<ProfileRow | null> {
  const db = getServiceClient()
  const { data, error } = await db
    .from('user_profiles')
    .select('shareable_profile, shareable_confirmed, agent_profile, embedding')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new ProfileError(`读取档案失败：${error.message}`)
  return (data as ProfileRow | null) ?? null
}

/** 撷取并写回。回传给前端的结果（不含 Big Five）。 */
export async function extractProfile(userId: string): Promise<ShareableView> {
  const db = getServiceClient()

  // 1. 用户说过的话（最新 60 则，只取 role user）＋上一版
  const { data: msgRows, error: mErr } = await db
    .from('friend_messages')
    .select('role, content')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(400)
  if (mErr) throw new ProfileError(`读取对话失败：${mErr.message}`)
  const userLines = (msgRows ?? [])
    .filter((m: { role: string }) => m.role === 'user')
    .slice(-PROFILE_USER_LINES_LIMIT)
    .map((m: { content: string }) => m.content)

  const previousRow = await getProfileRow(userId)
  const previousText = previousRow
    ? JSON.stringify({
        shareable_profile: previousRow.shareable_profile ?? null,
        agent_profile: previousRow.agent_profile ?? null,
      })
    : '（没有上一版）'

  // 2. Prompt 3（MODEL_REASON）
  const out = await llmJson({
    role: 'reason',
    system: renderProfileSystem({
      userLines: userLines.length ? userLines.map((l, i) => `${i + 1}. ${l}`).join('\n') : '（用户还没说过话）',
      previous: previousText,
    }),
    messages: [{ role: 'user', content: `请更新这位用户的档案（共 ${userLines.length} 则用户讯息）。` }],
    temperature: 0.2,
    schema: profileExtractSchema,
  })

  // 3. 写入 shareable／agent；内容有变 → confirmed 归 false
  const changed = shareableChanged(previousRow?.shareable_profile ?? null, out.shareable_profile)
  const { error: wErr } = await db.from('user_profiles').upsert({
    user_id: userId,
    shareable_profile: out.shareable_profile,
    agent_profile: out.agent_profile,
    shareable_confirmed: changed ? false : (previousRow?.shareable_confirmed ?? false),
    card: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (wErr) throw new ProfileError(`写入档案失败：${wErr.message}`)

  // 4. embedding（失败不致命：大厅会退回关键字排序）
  let embeddingNote = '已更新'
  try {
    const vector = await embed(shareableToText(out.shareable_profile))
    await db.from('user_profiles').update({ embedding: vector }).eq('user_id', userId)
  } catch (err) {
    embeddingNote = '向量更新失败（大厅暂用关键字排序）'
    console.error('[profile] embed 失败', err)
  }

  await writeLog({
    user_id: userId,
    agent: 'friend',
    action: '撷取用户档案',
    reason: `${userLines.length} 则用户讯息；shareable ${changed ? '有变化，待重新确认' : '无变化'}；${embeddingNote}`,
  })

  return { shareable: out.shareable_profile, confirmed: false, exists: true }
}

/** GET /api/profile 用：只回 shareable 与确认状态，绝不回 agent_profile。 */
export async function getShareableView(userId: string): Promise<ShareableView> {
  const row = await getProfileRow(userId)
  if (!row) return { shareable: null, confirmed: false, exists: false }
  return { shareable: row.shareable_profile, confirmed: row.shareable_confirmed, exists: true }
}

/** PUT /api/profile/shareable 用：用户修改并确认。 */
export const shareableUpdateSchema = z.object({
  intro: z.string().trim().min(1).max(40).default(''),
  interests: z.array(z.string().trim().min(1).max(30)).min(1).max(12).default([]),
  chat_style: z.string().trim().min(1).max(60).default(''),
  looking_for: z.string().trim().min(1).max(60).default(''),
})

export async function updateShareable(
  userId: string,
  input: z.infer<typeof shareableUpdateSchema>,
): Promise<ShareableView> {
  const db = getServiceClient()
  // 統一轉簡體：種子用戶興趣都是簡體，繁體「攝影」和「摄影」比對不到
  const next: ShareableProfile = shareableToSimplified({
    intro: input.intro,
    interests: input.interests,
    chat_style: input.chat_style,
    looking_for: input.looking_for,
  })

  const { error } = await db.from('user_profiles').upsert({
    user_id: userId,
    shareable_profile: next,
    shareable_confirmed: true,
    card: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) throw new ProfileError(`保存档案失败：${error.message}`)

  try {
    const vector = await embed(shareableToText(next))
    await db.from('user_profiles').update({ embedding: vector }).eq('user_id', userId)
  } catch (err) {
    console.error('[profile] embed 失败（确认保存不受影响）', err)
  }

  await writeLog({
    user_id: userId,
    agent: 'friend',
    action: '用户确认对外档案',
    reason: '用户手动编辑并确认',
  })
  return { shareable: next, confirmed: true, exists: true }
}

/** 背景撷取的触发规则（A2 第 6 步用）：用户讯息数是 PROFILE_EXTRACT_EVERY 的倍数。 */
export function shouldExtractProfile(userMessageCount: number): boolean {
  const every = CONFIG.PROFILE_EXTRACT_EVERY
  return every > 0 && userMessageCount > 0 && userMessageCount % every === 0
}

export type { ProfileExtract }