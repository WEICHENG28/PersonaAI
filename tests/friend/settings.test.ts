/**
 * A7：設定頁後端測試。
 * 必測：settingsUpdateSchema 驗證、updateSettings 幂等、social_agent 開啟前置條件。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { settingsUpdateSchema } from '../../server/friend/settings'
import * as supabaseLib from '../../server/lib/supabase'
import { setLogWriter } from '../../server/lib/log'

// ── schema 驗證 ──────────────────────────────────────────────────

describe('settingsUpdateSchema', () => {
  it('接受空物件（什麼都不改）', () => {
    expect(settingsUpdateSchema.safeParse({}).success).toBe(true)
  })

  it('接受合法的 proactive_frequency', () => {
    expect(settingsUpdateSchema.safeParse({ proactive_frequency: 'low' }).success).toBe(true)
    expect(settingsUpdateSchema.safeParse({ proactive_frequency: 'off' }).success).toBe(true)
    expect(settingsUpdateSchema.safeParse({ proactive_frequency: 'normal' }).success).toBe(true)
  })

  it('拒絕非法 proactive_frequency', () => {
    expect(settingsUpdateSchema.safeParse({ proactive_frequency: 'high' }).success).toBe(false)
  })

  it('接受合法的 match_tier', () => {
    expect(settingsUpdateSchema.safeParse({ match_tier: 'one_way' }).success).toBe(true)
    expect(settingsUpdateSchema.safeParse({ match_tier: 'mutual' }).success).toBe(true)
  })

  it('拒絕 daily_chat_limit 超出範圍', () => {
    expect(settingsUpdateSchema.safeParse({ daily_chat_limit: 0 }).success).toBe(false)
    expect(settingsUpdateSchema.safeParse({ daily_chat_limit: 101 }).success).toBe(false)
    expect(settingsUpdateSchema.safeParse({ daily_chat_limit: 10 }).success).toBe(true)
  })

  it('拒絕 manual_minutes_per_chat 超出範圍', () => {
    expect(settingsUpdateSchema.safeParse({ manual_minutes_per_chat: 0 }).success).toBe(false)
    expect(settingsUpdateSchema.safeParse({ manual_minutes_per_chat: 121 }).success).toBe(false)
    expect(settingsUpdateSchema.safeParse({ manual_minutes_per_chat: 30 }).success).toBe(true)
  })
})

// ── updateSettings 整合 ──────────────────────────────────────────

describe('updateSettings', () => {
  let mockDb: any

  const makeUserRow = (overrides = {}) => ({
    dev_mode: false,
    proactive_frequency: 'normal',
    social_agent_enabled: false,
    match_tier: 'mutual',
    daily_chat_limit: 10,
    manual_minutes_per_chat: 20,
    ...overrides,
  })

  beforeEach(() => {
    const userRow = makeUserRow()
    mockDb = {
      from: (table: string) => ({
        select: (_cols?: string) => ({
          eq: (_col: string, _val: unknown) => ({
            single: () => Promise.resolve({ data: userRow, error: null }),
            maybeSingle: () =>
              table === 'user_profiles'
                ? Promise.resolve({ data: { shareable_confirmed: true }, error: null })
                : Promise.resolve({ data: userRow, error: null }),
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          Object.assign(userRow, patch)
          return {
            eq: () => Promise.resolve({ error: null }),
          }
        },
      }),
    }
    vi.spyOn(supabaseLib, 'getServiceClient').mockReturnValue(mockDb as any)
    setLogWriter(async () => { })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    supabaseLib.resetServiceClientForTest()
    setLogWriter(null)
  })

  it('只更新傳入的欄位', async () => {
    const { updateSettings } = await import('../../server/friend/settings')
    const result = await updateSettings('u1', { dev_mode: true })
    expect(result.dev_mode).toBe(true)
    // 其他欄位不變
    expect(result.proactive_frequency).toBe('normal')
  })

  it('不傳任何欄位也能成功（冪等）', async () => {
    const { updateSettings } = await import('../../server/friend/settings')
    const result = await updateSettings('u1', {})
    expect(result).toBeDefined()
  })

  it('shareable_confirmed = false 時開啟 social_agent 拋錯', async () => {
    // 覆寫 user_profiles mock：shareable_confirmed = false
    mockDb.from = (table: string) => ({
      select: (_cols?: string) => ({
        eq: (_col: string, _val: unknown) => ({
          single: () => Promise.resolve({ data: makeUserRow(), error: null }),
          maybeSingle: () =>
            table === 'user_profiles'
              ? Promise.resolve({ data: { shareable_confirmed: false }, error: null })
              : Promise.resolve({ data: makeUserRow(), error: null }),
        }),
      }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    })

    const { updateSettings, SettingsError } = await import('../../server/friend/settings')
    await expect(updateSettings('u1', { social_agent_enabled: true })).rejects.toThrow(SettingsError)
  })
})
