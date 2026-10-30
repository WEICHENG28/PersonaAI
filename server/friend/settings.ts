/**
 * A7：設定頁後端邏輯。擁有者：A。
 * 讀 / 更新 users 表中的設定欄位（dev_mode、proactive_frequency、social_agent_enabled 等）。
 */
import { z } from 'zod'
import { getServiceClient } from '../lib/supabase'

// ──────────── Zod schema（PUT /api/settings 的 body）────────────

export const settingsUpdateSchema = z.object({
  dev_mode: z.boolean().optional(),
  proactive_frequency: z.enum(['off', 'low', 'normal']).optional(),
  social_agent_enabled: z.boolean().optional(),
  match_tier: z.enum(['one_way', 'mutual']).optional(),
  daily_chat_limit: z.number().int().min(1).max(100).optional(),
  manual_minutes_per_chat: z.number().int().min(1).max(120).optional(),
})

export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>

export interface UserSettings {
  dev_mode: boolean
  proactive_frequency: 'off' | 'low' | 'normal'
  social_agent_enabled: boolean
  match_tier: 'one_way' | 'mutual'
  daily_chat_limit: number
  manual_minutes_per_chat: number
  shareable_confirmed: boolean   // 開啟 social_agent 需要此值，前端用
}

const SETTINGS_COLS = [
  'dev_mode',
  'proactive_frequency',
  'social_agent_enabled',
  'match_tier',
  'daily_chat_limit',
  'manual_minutes_per_chat',
].join(', ')

export class SettingsError extends Error {
  constructor(message = '设定更新失败') {
    super(message)
    this.name = 'SettingsError'
  }
}

/**
 * 讀取目前設定（含 shareable_confirmed，供前端判斷能否開 social_agent）。
 */
export async function getSettings(userId: string): Promise<UserSettings> {
  const db = getServiceClient()

  // 讀 users 表
  const { data: u, error: uErr } = await db
    .from('users')
    .select(SETTINGS_COLS)
    .eq('id', userId)
    .single()
  if (uErr || !u) throw new SettingsError(`读取设定失败：${uErr?.message ?? 'no row'}`)

  // 讀 user_profiles 取 shareable_confirmed
  const { data: p } = await db
    .from('user_profiles')
    .select('shareable_confirmed')
    .eq('user_id', userId)
    .maybeSingle()

  const row = u as unknown as Record<string, unknown>
  return {
    dev_mode: Boolean(row.dev_mode),
    proactive_frequency: (row.proactive_frequency as 'off' | 'low' | 'normal') ?? 'normal',
    social_agent_enabled: Boolean(row.social_agent_enabled),
    match_tier: (row.match_tier as 'one_way' | 'mutual') ?? 'mutual',
    daily_chat_limit: Number(row.daily_chat_limit) || 10,
    manual_minutes_per_chat: Number(row.manual_minutes_per_chat) || 20,
    shareable_confirmed: Boolean(p?.shareable_confirmed),
  }
}

/**
 * 更新設定（只更新傳入的欄位；幂等）。
 * 若要開啟 social_agent_enabled 但 shareable_confirmed = false，拋 SettingsError。
 */
export async function updateSettings(userId: string, input: SettingsUpdate): Promise<UserSettings> {
  // 若要開啟社交 Agent，先確認 shareable_confirmed
  if (input.social_agent_enabled === true) {
    const db = getServiceClient()
    const { data: p } = await db
      .from('user_profiles')
      .select('shareable_confirmed')
      .eq('user_id', userId)
      .maybeSingle()
    if (!p?.shareable_confirmed) {
      throw new SettingsError('请先确认你的对外档案，才能开启社交 Agent')
    }
  }

  const db = getServiceClient()
  const patch: Record<string, unknown> = {}
  if (input.dev_mode !== undefined) patch.dev_mode = input.dev_mode
  if (input.proactive_frequency !== undefined) patch.proactive_frequency = input.proactive_frequency
  if (input.social_agent_enabled !== undefined) patch.social_agent_enabled = input.social_agent_enabled
  if (input.match_tier !== undefined) patch.match_tier = input.match_tier
  if (input.daily_chat_limit !== undefined) patch.daily_chat_limit = input.daily_chat_limit
  if (input.manual_minutes_per_chat !== undefined) patch.manual_minutes_per_chat = input.manual_minutes_per_chat

  if (Object.keys(patch).length > 0) {
    const { error } = await db.from('users').update(patch).eq('id', userId)
    if (error) throw new SettingsError(`更新设定失败：${error.message}`)
  }

  return getSettings(userId)
}
