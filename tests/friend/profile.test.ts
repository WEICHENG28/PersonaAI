/**
 * A4 必测：Prompt 3 渲染、profileExtractSchema 边界、extractProfile 主流程、
 * shareableChanged / shouldExtractProfile、contracts 读库（LLM/DB 全 mock）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── mock Supabase：按表分 chain（同 chat.test / memory.test 手法） ──
const tables: Record<string, TableMock> = {}

interface TableMock {
  list: Record<string, unknown>[]
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  is: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  upsert: ReturnType<typeof vi.fn>
}

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

function validExtract() {
  return {
    shareable_profile: {
      intro: '喜欢看展的二次元',
      interests: ['动漫', '看展'],
      chat_style: '句子不长，先回应情绪',
      looking_for: '可以一起逛展的朋友',
    },
    agent_profile: {
      big_five: {
        O: { score: 72, confidence: 0.6, evidence: '多次提到尝试新活动' },
        C: { score: 50, confidence: 0.1, evidence: '' },
        E: { score: 38, confidence: 0.3, evidence: '偶尔提到小圈子' },
        A: { score: 70, confidence: 0.5, evidence: '对朋友的事情表现出关心' },
        N: { score: 45, confidence: 0.2, evidence: '' },
      },
      values: ['真诚'],
      style: { sentence_length: 'short', tone: '温和', emoji_level: 1, formality: 'casual' },
    },
  }
}

function makeTable(name: string): TableMock {
  const t: TableMock = {
    list: [],
    select: vi.fn(() => t.self),
    eq: vi.fn(() => t.self),
    is: vi.fn(() => t.self),
    order: vi.fn(() => t.self),
    limit: vi.fn(async () => ({ data: t.list, error: null })),
    maybeSingle: vi.fn(async () => ({ data: t.list[0] ?? null, error: null })),
    single: vi.fn(async () =>
      t.list[0] ? { data: t.list[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } },
    ),
    insert: vi.fn((row: Record<string, unknown> | Record<string, unknown>[]) => {
      t.list.push(...(Array.isArray(row) ? row : [row]))
      return { select: () => ({ single: t.single }) }
    }),
    upsert: vi.fn((row: Record<string, unknown>) => {
      t.list.length = 0
      t.list.push(row)
      return { error: null }
    }),
    update: vi.fn((patch: Record<string, unknown>) => {
      Object.assign(t.list[0] ?? {}, patch)
      return t.self
    }),
  }
  Object.assign(t, { self: t })
  tables[name] = t
  return t
}

function failTable(name: string) {
  throw new Error(`测试未 mock 表 ${name}`)
}

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
      { role: 'user', content: '我周末要去漫展' },
      { role: 'friend', content: '听起来不错' },
      { role: 'user', content: '我也常看展' },
    )
    const view = await extractProfile('u1')
    expect(view.exists).toBe(true)
    expect(view.shareable?.interests).toContain('动漫')
    expect(embed).toHaveBeenCalled()
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
    // view 回的 confirmed 恒为 false（表示「这次生成后需确认」），
    // 但库中内容没变时不应把已确认的行归 false
    expect(view.confirmed).toBe(false)
    expect(tables['user_profiles']!.list[0]).toMatchObject({ shareable_confirmed: true })
  })

  it('只取 role=user 的最新 60 则', async () => {
    for (let i = 0; i < 80; i++) {
      tables['friend_messages']!.list.push({ role: 'user', content: `msg-${i}` })
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
    expect(embed).toHaveBeenCalled()
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
