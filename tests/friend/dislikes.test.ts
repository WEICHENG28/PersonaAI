/**
 * Issue 4 必测：Prompt 3（档案撷取）—— 不喜欢的事物不进 interests。
 * 测试策略：
 * 1. 直接测 profileExtractSchema（Zod schema），验证 avoidance 字段存在。
 * 2. mock llmJson 返回含不喜欢项目的 agent_profile.avoidance，
 *    并验证 interests 不含该项目。
 * 3. 测试场景：「我不喜欢看展、我喜欢打游戏」→ interests 有打游戏，没有看展。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── mock Supabase（extractProfile 需要）──────────────────────────────────────
const dbRows: Record<string, unknown[]> = {
  users: [{ id: 'u1', nickname: 'test', created_at: new Date().toISOString() }],
  ai_friends: [{ user_id: 'u1', story_stage: 1, shared_event_ids: [] }],
  friend_messages: [],
  user_profiles: [],
}

function makeTable(name: string) {
  const self = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => ({ data: dbRows[name]?.[0] ?? null, error: null })),
    single: vi.fn(async () => ({ data: dbRows[name]?.[0] ?? null, error: null })),
    insert: vi.fn(async () => ({ error: null })),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn(async () => ({ error: null })),
  }
  // eq/order/limit/is chains end with the same select result
  self.eq.mockReturnThis()
  self.order.mockReturnThis()
  self.limit.mockImplementation(async () => ({ data: dbRows[name] ?? [], error: null }))
  self.is.mockReturnThis()
  return { self }
}

vi.mock('../../server/lib/supabase', () => ({
  getServiceClient: () => ({
    from: (name: string) => makeTable(name).self,
  }),
}))
vi.mock('../../server/lib/log', () => ({ writeLog: vi.fn(async () => {}) }))

const mockLlmJson = vi.fn()
vi.mock('../../server/lib/llm', () => ({
  llmJson: (...args: unknown[]) => mockLlmJson(...args),
}))

// ── 测试 ─────────────────────────────────────────────────────────────────────

describe('Prompt 3：不喜欢的事物不进 interests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('profileExtractSchema 包含 avoidance 字段（默认空数组）', async () => {
    const { profileExtractSchema } = await import('../../server/prompts/03_profile.js')
    const result = profileExtractSchema.parse({
      shareable_profile: {
        intro: '喜欢打游戏的人',
        interests: ['打游戏'],
        chat_style: '随意',
        looking_for: '找队友',
      },
      agent_profile: {
        big_five: {
          O: { score: 60, confidence: 0.5, evidence: '' },
          C: { score: 50, confidence: 0.1, evidence: '' },
          E: { score: 50, confidence: 0.1, evidence: '' },
          A: { score: 50, confidence: 0.1, evidence: '' },
          N: { score: 50, confidence: 0.1, evidence: '' },
        },
        values: [],
        avoidance: ['看展'],
        style: { sentence_length: 'short', tone: '随意', emoji_level: 1, formality: 'casual' },
      },
    })
    expect(result.agent_profile.avoidance).toEqual(['看展'])
    expect(result.shareable_profile.interests).toEqual(['打游戏'])
    expect(result.shareable_profile.interests).not.toContain('看展')
  })

  it('avoidance 字段可以省略（默认空数组）', async () => {
    const { profileExtractSchema } = await import('../../server/prompts/03_profile.js')
    const result = profileExtractSchema.parse({
      shareable_profile: { intro: '', interests: [], chat_style: '', looking_for: '' },
      agent_profile: {
        big_five: {
          O: { score: 50, confidence: 0.1, evidence: '' },
          C: { score: 50, confidence: 0.1, evidence: '' },
          E: { score: 50, confidence: 0.1, evidence: '' },
          A: { score: 50, confidence: 0.1, evidence: '' },
          N: { score: 50, confidence: 0.1, evidence: '' },
        },
        values: [],
        style: { sentence_length: 'short', tone: '', emoji_level: 1, formality: 'casual' },
      },
    })
    expect(result.agent_profile.avoidance).toEqual([])
  })

  it('「我不喜欢看展、我喜欢打游戏」→ interests 有打游戏，没有看展', async () => {
    // LLM mock：模拟 LLM 已正确区分（按 Prompt 3 规则），avoidance 含看展，interests 无看展
    mockLlmJson.mockResolvedValue({
      shareable_profile: {
        intro: '爱玩游戏',
        interests: ['打游戏'],       // 只含明确喜欢的
        chat_style: '随意聊',
        looking_for: '找游戏搭档',
      },
      agent_profile: {
        big_five: {
          O: { score: 60, confidence: 0.4, evidence: '提到游戏' },
          C: { score: 50, confidence: 0.1, evidence: '' },
          E: { score: 50, confidence: 0.1, evidence: '' },
          A: { score: 50, confidence: 0.1, evidence: '' },
          N: { score: 50, confidence: 0.1, evidence: '' },
        },
        values: [],
        avoidance: ['看展'],          // 不喜欢的进这里
        style: { sentence_length: 'short', tone: '随意', emoji_level: 0, formality: 'casual' },
      },
    })

    // 配置 friend_messages 包含用户所说的话
    dbRows.friend_messages = [
      { role: 'user', content: '我不喜欢看展' },
      { role: 'user', content: '我喜欢打游戏' },
    ]
    dbRows.user_profiles = []

    const { extractProfile } = await import('../../server/friend/profile.js')
    // extractProfile 返回 { shareable, confirmed, exists }；llmJson mock 的 out 也会被 Zod 解析
    // 此测试验证 Zod 解析后 interests 不含 avoidance 里的内容
    const result = await extractProfile('u1')

    // result.shareable 是 shareable_profile（经过 Zod 解析的输出）
    expect(result.shareable!.interests).toContain('打游戏')
    expect(result.shareable!.interests).not.toContain('看展')
    // LLM 回传的 avoidance 已进入 agent_profile（不在返回值里，但 mock 已验证 LLM 被正确调用）
    expect(mockLlmJson).toHaveBeenCalledOnce()
  })

  it('Prompt 3 系统提示包含「不喜欢」区分规则', async () => {
    const { PROFILE_PROMPT_SYSTEM } = await import('../../server/prompts/03_profile.js')
    expect(PROFILE_PROMPT_SYSTEM).toContain('不喜欢')
    expect(PROFILE_PROMPT_SYSTEM).toContain('avoidance')
    expect(PROFILE_PROMPT_SYSTEM).toContain('interests')
  })
})
