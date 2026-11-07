/**
 * A4 必测：Prompt 3 渲染、profileExtractSchema 边界、extractProfile 主流程、
 * shareableChanged / shouldExtractProfile、contracts 读库（LLM/DB 全 mock）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tables, makeTable, failTable, validExtract } from './profile-test-fixtures'
import * as profileModule from '../../server/friend/profile'
vi.mock('../../server/lib/auth', () => ({ requireAuth: vi.fn(async () => ({ authId: 'auth-u1' })), isAuthFailure: () => false }))

// ── mock Supabase：按表分 chain（同 chat.test / memory.test 手法） ──
vi.mock('../../server/lib/supabase', () => ({
  getServiceClient: () => ({
    from: (name: string) => tables[name]?.self ?? failTable(name),
  }),
}))
vi.mock('../../server/lib/llm', () => ({
  llmJson: vi.fn(async () => validExtract()),
  embed: vi.fn(async () => [0.1, 0.2, 0.3]),
}))
vi.mock('../../server/lib/log', () => ({ writeLog: vi.fn(async () => {}) }))

import { llmJson, embed } from '../../server/lib/llm'
import { writeLog } from '../../server/lib/log'
import {
  extractProfile,
  getShareableView,
  updateShareable,
  shareableToText,
  shareableChanged,
  shouldExtractProfile,
} from '../../server/friend/profile'
import { renderProfileSystem, profileExtractSchema } from '../../server/prompts/03_profile'
import { getShareableProfile, getAgentProfile, getStyleProfile } from '../../server/contracts/friend'

beforeEach(() => {
  vi.clearAllMocks()
  const prevUrl = process.env.SUPABASE_URL
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  vi.mocked(llmJson).mockImplementation(async () => validExtract())
  for (const k of Object.keys(tables)) delete tables[k]
  makeTable('user_profiles')
  makeTable('friend_messages')
  return () => {
    if (prevUrl) process.env.SUPABASE_URL = prevUrl
    if (prevKey) process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey
  }
})

describe('renderProfileSystem', () => {
  it('占位符全部替换', () => {
    const sys = renderProfileSystem({ userLines: '1. 我周末要去漫展', previous: '（没有上一版）' })
    for (const ph of ['{{user_lines}}', '{{previous}}']) {
      expect(sys).not.toContain(ph)
    }
    expect(sys).toContain('我周末要去漫展')
    expect(sys).toContain('规则')
  })
})

describe('profileExtractSchema', () => {
  it('完整输出通过', () => {
    expect(() => profileExtractSchema.parse(validExtract())).not.toThrow()
  })
  it('缺 big_five 任一项拒', () => {
    const bad = validExtract() as Record<string, unknown>
    const agent = bad.agent_profile as Record<string, unknown>
    agent.big_five = { O: { score: 50, confidence: 0.1, evidence: '' } }
    expect(() => profileExtractSchema.parse(bad)).toThrow()
  })
  it('score/confidence 超范围拒', () => {
    const bad = validExtract() as { agent_profile: { big_five: Record<string, { score: number; confidence: number; evidence: string }> } }
    bad.agent_profile.big_five.O = { score: 150, confidence: 0.5, evidence: '' }
    expect(() => profileExtractSchema.parse(bad)).toThrow()
  })
  it('style 枚举与 emoji 0–3 边界', () => {
    const base = validExtract() as { agent_profile: { style: Record<string, unknown> } }
    base.agent_profile.style.sentence_length = 'huge'
    expect(() => profileExtractSchema.parse(base)).toThrow()
    const base2 = validExtract() as { agent_profile: { style: Record<string, unknown> } }
    base2.agent_profile.style.emoji_level = 4
    expect(() => profileExtractSchema.parse(base2)).toThrow()
  })
})

describe('shareableToText / shareableChanged', () => {
  it('四字段串成一段', () => {
    const text = shareableToText({
      intro: '爱看展',
      interests: ['看展', '动漫'],
      chat_style: '短句',
      looking_for: '逛展伙伴',
    })
    expect(text).toContain('简介：爱看展')
    expect(text).toContain('兴趣：看展、动漫')
    expect(text).toContain('聊天风格：短句')
    expect(text).toContain('想找：逛展伙伴')
  })
  it('null 或字段变了算有变', () => {
    const a = { intro: 'x', interests: ['a'], chat_style: 's', looking_for: 'l' }
    expect(shareableChanged(null, a)).toBe(true)
    expect(shareableChanged(a, null)).toBe(true)
    expect(shareableChanged(a, { ...a, intro: 'y' })).toBe(true)
    expect(shareableChanged(a, a)).toBe(false)
  })
  it('interests 顺序不同视为相同', () => {
    const a = { intro: 'x', interests: ['a', 'b'], chat_style: 's', looking_for: 'l' }
    const b = { intro: 'x', interests: ['b', 'a'], chat_style: 's', looking_for: 'l' }
    expect(shareableChanged(a, b)).toBe(false)
  })
})

describe('shouldExtractProfile', () => {
  it('PROFILE_EXTRACT_EVERY=6 的倍数触发', () => {
    expect(shouldExtractProfile(6)).toBe(true)
    expect(shouldExtractProfile(12)).toBe(true)
    expect(shouldExtractProfile(5)).toBe(false)
    expect(shouldExtractProfile(0)).toBe(false)
  })
})

describe('extractProfile（mock LLM/DB）', () => {
  it('撷取→写 shareable/agent、计算 embedding、写日志', async () => {
    tables['friend_messages']!.list.push(
      { user_id: 'u1', role: 'user', content: '我周末要去漫展' },
      { role: 'friend', content: '听起来不错' },
      { user_id: 'u1', role: 'user', content: '我也常看展' },
    )
    const view = await extractProfile('u1')
    expect(view.exists).toBe(true)
    expect(view.shareable?.interests).toContain('动漫')
    expect(embed).toHaveBeenCalledWith(expect.any(String), 'bg')
    expect(writeLog).toHaveBeenCalled()
    const row = tables['user_profiles']!.list[0]
    expect(row).toMatchObject({ user_id: 'u1', card: null })
    expect(row).toHaveProperty('agent_profile')
  })

  it('无上一版：shareable_confirmed=false', async () => {
    const view = await extractProfile('u1')
    expect(view.confirmed).toBe(false)
    expect(tables['user_profiles']!.list[0]).toMatchObject({ shareable_confirmed: false })
  })

  it('有上一版且内容相同：保留已确认状态（LLM 回上一版内容）', async () => {
    const same = validExtract()
    tables['user_profiles']!.list.push({
      user_id: 'u1',
      shareable_profile: same.shareable_profile,
      shareable_confirmed: true,
      agent_profile: null,
    })
    vi.mocked(llmJson).mockResolvedValueOnce(same as never)
    const view = await extractProfile('u1')
    expect(view.confirmed).toBe(true)
    expect(tables['user_profiles']!.list[0]).toMatchObject({ shareable_confirmed: true })
  })

  it('只取 role=user 的最新 60 则', async () => {
    for (let i = 0; i < 80; i++) {
      tables['friend_messages']!.list.push({ user_id: 'u1', role: 'user', content: `msg-${i}` })
    }
    await extractProfile('u1')
    const call = vi.mocked(llmJson).mock.calls[0]?.[0] as unknown as {
      system?: string
      messages?: { role: string; content: string }[]
    }
    // user 讯息带总数；system 里的行从 msg-20 开始（丢掉最早 20 条）
    expect(call?.messages?.[0]?.content).toContain('共 60 则用户讯息')
    expect(call?.system).toContain('1. msg-20')
    expect(call?.system).not.toContain('msg-19')
  })

  it('embed 失败不致命（仍写入档案）', async () => {
    vi.mocked(embed).mockRejectedValueOnce(new Error('embed down') as never)
    const view = await extractProfile('u1')
    expect(view.exists).toBe(true)
    expect(tables['user_profiles']!.list[0]).toHaveProperty('shareable_profile')
  })
})

describe('getShareableView / updateShareable', () => {
  it('无行回 exists=false', async () => {
    const view = await getShareableView('u1')
    expect(view).toEqual({ shareable: null, confirmed: false, exists: false })
  })

  it('有行回 shareable 与确认状态', async () => {
    tables['user_profiles']!.list.push({
      shareable_profile: { intro: 'x', interests: ['a'], chat_style: 's', looking_for: 'l' },
      shareable_confirmed: true,
    })
    const view = await getShareableView('u1')
    expect(view.confirmed).toBe(true)
    expect(view.shareable?.intro).toBe('x')
  })

  it('updateShareable：写 confirmed=true 并重算 embedding', async () => {
    const view = await updateShareable('u1', {
      intro: '爱看展的我',
      interests: ['看展'],
      chat_style: '短句',
      looking_for: '逛展伙伴',
    })
    expect(view.confirmed).toBe(true)
    expect(tables['user_profiles']!.list[0]).toMatchObject({ shareable_confirmed: true, card: null })
    expect(embed).toHaveBeenCalledWith(expect.any(String), 'bg')
  })

  it('updateShareable：繁体兴趣统一转简体（「攝影」→「摄影」，与种子用户可比对）', async () => {
    await updateShareable('u1', {
      intro: '喜歡攝影',
      interests: ['攝影', '看漫畫'],
      chat_style: '溫和',
      looking_for: '找運動夥伴',
    })
    const saved = tables['user_profiles']!.list[0] as { shareable_profile: { interests: string[] } }
    expect(saved.shareable_profile.interests).toEqual(['摄影', '看漫画'])
  })
})

describe('contracts（无 DB 设定回退 fixtures；有 DB 读库）', () => {
  it('无 DB 设定时回 fixtures（B 的 server.test 依赖此行为）', async () => {
    expect(await getShareableProfile('u1')).not.toBeNull()
    expect(await getAgentProfile('u1')).not.toBeNull()
    expect(await getStyleProfile('u1')).not.toBeNull()
  })

  it('有 DB 设定但库中无值回 null', async () => {
    process.env.SUPABASE_URL = 'http://127.0.0.1:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
    try {
      expect(await getShareableProfile('u1')).toBeNull()
      expect(await getAgentProfile('u1')).toBeNull()
      expect(await getStyleProfile('u1')).toBeNull()
    } finally {
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
    }
  })

  it('有 DB 设定且库中有值（shareable_confirmed = true）：shareable 原样、agent 深拷贝、style 只回 agent_profile.style', async () => {
    process.env.SUPABASE_URL = 'http://127.0.0.1:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
    try {
      const full = validExtract()
      tables['user_profiles']!.list.push({
        shareable_profile: full.shareable_profile,
        shareable_confirmed: true,
        agent_profile: full.agent_profile,
      })
      const shareable = await getShareableProfile('u1')
      expect(shareable?.interests).toContain('动漫')
      const agent = await getAgentProfile('u1')
      expect(agent?.big_five.O.score).toBe(72)
      expect(agent).not.toBe(full.agent_profile) // 深拷贝，不回同一引用
      const style = await getStyleProfile('u1')
      expect(style?.sentence_length).toBe('short')
    } finally {
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
    }
  })

  it('shareable_confirmed = false（extractProfile 产出新草稿）：getShareableProfile 回 null，分身/守门拿不到未确认内容', async () => {
    process.env.SUPABASE_URL = 'http://127.0.0.1:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
    try {
      const full = validExtract()
      tables['user_profiles']!.list.push({
        shareable_profile: full.shareable_profile,
        shareable_confirmed: false,
        agent_profile: full.agent_profile,
      })
      expect(await getShareableProfile('u1')).toBeNull()
      // agent_profile 不受确认状态影响（B 判定用，不外流）
      expect(await getAgentProfile('u1')).not.toBeNull()
    } finally {
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
    }
  })

  it('shareable_confirmed 缺省（null，从未确认）：getShareableProfile 回 null', async () => {
    process.env.SUPABASE_URL = 'http://127.0.0.1:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
    try {
      const full = validExtract()
      tables['user_profiles']!.list.push({
        shareable_profile: full.shareable_profile,
        shareable_confirmed: null,
        agent_profile: full.agent_profile,
      })
      expect(await getShareableProfile('u1')).toBeNull()
    } finally {
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
    }
  })
})

it('filters user messages before descending limit, then renders chronological lines', async () => {
  tables.friend_messages!.list.push(...Array.from({ length: 500 }, (_, n) => ({ user_id: 'u1', role: n % 2 ? 'friend' : 'user', content: `line-${n}` })))
  await extractProfile('u1')
  const table = tables.friend_messages!
  expect(table.eq).toHaveBeenCalledWith('role', 'user')
  expect(table.order).toHaveBeenCalledWith('created_at', { ascending: false })
  expect(table.limit).toHaveBeenCalledWith(60)
  const system = vi.mocked(llmJson).mock.calls[0]![0].system
  expect(system).toContain('1. line-380')
  expect(system).toContain('60. line-498')
  expect(system).not.toContain('line-0')
})
it('counts all user chat messages scoped to this user with count/head', async () => {
  const { countUserChatMessages } = await import('../../server/friend/profile.js')
  tables.friend_messages!.list.push(
    ...Array.from({ length: 12 }, () => ({ user_id: 'u1', role: 'user', kind: 'chat' })),
    { user_id: 'u2', role: 'user', kind: 'chat' }, { user_id: 'u1', role: 'friend', kind: 'chat' },
    { user_id: 'u1', role: 'user', kind: 'task_card' })
  expect(await countUserChatMessages('u1')).toBe(12)
  expect(tables.friend_messages!.select).toHaveBeenCalledWith('id', { count: 'exact', head: true })
})

it.each([
  { confirmed: true, force: false, preserve: true },
  { confirmed: true, force: true, preserve: false },
  { confirmed: false, force: false, preserve: false },
])('respects confirmation and force: %j', async ({ confirmed, force, preserve }) => {
  const original = { user_id: 'u1', shareable_profile: { ...validExtract().shareable_profile, intro: '旧的对外介绍' },
    shareable_confirmed: confirmed, card: { headline: '原卡片' }, embedding: [9, 8], agent_profile: null }
  const table = tables.user_profiles!
  table.list.push(structuredClone(original))
  const result = await extractProfile('u1', { force })
  if (preserve) {
    expect(table.upsert).not.toHaveBeenCalled()
    expect(table.update).toHaveBeenCalledTimes(1)
    expect(table.update.mock.calls[0]![0]).toEqual({ agent_profile: validExtract().agent_profile, updated_at: expect.any(String) })
    expect(table.eq).toHaveBeenCalledWith('user_id', 'u1')
    expect(embed).not.toHaveBeenCalled()
    expect(table.list[0]).toMatchObject({ shareable_profile: original.shareable_profile, shareable_confirmed: true, card: original.card, embedding: original.embedding })
    expect(result).toEqual({ shareable: original.shareable_profile, confirmed: true, exists: true })
    expect(writeLog).toHaveBeenCalledWith(expect.objectContaining({ reason: '已确认的对外档案不自动覆盖，只更新说话风格' }))
  } else {
    expect(table.upsert).toHaveBeenCalledWith(expect.objectContaining({ shareable_profile: validExtract().shareable_profile, shareable_confirmed: false, card: null }), { onConflict: 'user_id' })
    expect(embed).toHaveBeenCalledWith(expect.any(String), 'bg')
    expect(result.confirmed).toBe(false)
  }
})
it('manual POST profile/extract opts into force without a request body', async () => {
  makeTable('users').list.push({ id: 'u1', auth_id: 'auth-u1' })
  const spy = vi.spyOn(profileModule, 'extractProfile').mockResolvedValue({ shareable: null, confirmed: false, exists: true })
  try {
    const { friendRoutes } = await import('../../server/routes/friend.js')
    const response = await friendRoutes.request('/profile/extract', { method: 'POST' })
    expect(response.status).toBe(200)
    expect(spy).toHaveBeenCalledWith('u1', { force: true })
  } finally { spy.mockRestore() }
})

it('preserves the confirmed public profile after 30 messages and five background extractions', async () => {
  const shareable = { ...validExtract().shareable_profile, intro: '已确认的介绍' }
  tables.user_profiles!.list.push({ user_id: 'u1', shareable_profile: shareable, shareable_confirmed: true, card: { headline: 'old' }, embedding: [1], agent_profile: null })
  for (let n = 1; n <= 30; n++) {
    tables.friend_messages!.list.push({ user_id: 'u1', role: 'user', kind: 'chat', content: `新消息${n}` })
    if (n % 6 === 0) await extractProfile('u1')
  }
  expect(await getShareableView('u1')).toEqual({ shareable, confirmed: true, exists: true })
  expect(tables.user_profiles!.update).toHaveBeenCalledTimes(5)
  expect(tables.user_profiles!.upsert).not.toHaveBeenCalled(); expect(embed).not.toHaveBeenCalled()
})
