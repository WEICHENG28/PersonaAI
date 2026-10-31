/**
 * Nudge（阿澈主动接话）测试：
 * 1. 同一段沉默（最后一条 user 讯息之后已有 meta.nudge 讯息）→ 后端直接返回，不再呼叫 LLM、不存讯息。
 * 2. 使用者回话之后可以再 nudge 1 次。
 * 3. nudge 模式不建任务（task_intent 被忽略）。
 * 4. 前端计时器规则：同一沉默只排一次；分頁背景不发（scheduleNudge 纯函数测试）。
 * LLM 一律 mock。
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

// ── mock Supabase：按表分 chain（同 chat.test 手法） ──
interface Row { role: string; kind?: string; content: string; meta?: Record<string, unknown> | null }
const messages: Row[] = []
const insertedTaskCalls: string[] = []

function makeFrom(name: string) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn(async () => {
      if (name === 'friend_messages') {
        // 回傳倒序（latest first），friendChat 的 nudge 防重複用
        return { data: [...messages].reverse(), error: null }
      }
      return { data: [], error: null }
    }),
    maybeSingle: vi.fn(async () => ({
      data: name === 'ai_friends' ? { user_id: 'u1', story_stage: 1, life_state: { mood: '好', doing: '发呆' }, shared_event_ids: [], intro_done: true } : null,
      error: null,
    })),
    single: vi.fn(async () => ({ data: null, error: null })),
    insert: vi.fn(async (payload: Row & { meta?: Record<string, unknown> }) => {
      if (payload.kind === 'task_card') insertedTaskCalls.push(String(payload.content))
      else messages.push({ role: payload.role, kind: payload.kind, content: payload.content, meta: payload.meta })
      return { error: null }
    }),
    update: vi.fn().mockReturnThis(),
  }
  return chain
}

vi.mock('../../server/lib/supabase', () => ({
  getServiceClient: () => ({
    from: (name: string) => makeFrom(name),
  }),
}))

const llmJsonMock = vi.fn()
vi.mock('../../server/lib/llm', () => ({
  llmJson: (...args: unknown[]) => llmJsonMock(...args),
}))
vi.mock('../../server/lib/log', () => ({ writeLog: vi.fn(async () => {}) }))
vi.mock('../../server/social/task', () => ({
  createTaskFromText: vi.fn(async (_userId: string, text: string) => {
    insertedTaskCalls.push(`task:${text}`)
    return { id: 'task-1', restatement: text }
  }),
}))
vi.mock('../../server/friend/memory', () => ({ extractMemories: vi.fn(async () => 0) }))
vi.mock('../../server/friend/profile', () => ({
  extractProfile: vi.fn(async () => ({})),
  shouldExtractProfile: vi.fn(() => false),
}))
vi.mock('../../server/lib/config', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../server/lib/config')>()
  return { ...orig, CONFIG: { ...orig.CONFIG, FRIEND_HISTORY_LIMIT: 12, CRISIS_RESOURCE: 'x' } }
})

describe('Nudge 防重复（后端）', () => {
  beforeEach(() => {
    messages.length = 0
    insertedTaskCalls.length = 0
    llmJsonMock.mockReset()
    llmJsonMock.mockResolvedValue({ reply: '嗯，我想到一件事', shared_event_id: null, task_intent: false })
  })

  it('连打两次 nudge 只产生 1 则 AI 讯息（第二次被后端挡下、不呼叫 LLM）', async () => {
    const { friendChat } = await import('../../server/friend/chat.js')

    // 沉默：最后是 AI 的旧讯息
    messages.push({ role: 'user', content: '我喜欢打游戏' })
    messages.push({ role: 'friend', content: '好啊，哪种游戏？' })

    // 第一次 nudge → 应该呼叫 LLM、存 1 则 meta.nudge 讯息
    const r1 = await friendChat('u1', '', 'nudge')
    expect(r1.nudged).toBeUndefined()
    expect(llmJsonMock).toHaveBeenCalledTimes(1)
    const nudgeMsgs = messages.filter((m) => m.meta?.nudge === true)
    expect(nudgeMsgs).toHaveLength(1)

    // 第二次 nudge（同一沉默，例如另一个分頁/计时器又触发）→ 后端直接挡下
    const r2 = await friendChat('u1', '', 'nudge')
    expect(r2.nudged).toBe(true)
    expect(llmJsonMock).toHaveBeenCalledTimes(1) // 没有再呼叫 LLM
    expect(messages.filter((m) => m.meta?.nudge === true)).toHaveLength(1) // 也没有新讯息
  })

  it('使用者回话之后可以再 nudge 1 次', async () => {
    const { friendChat } = await import('../../server/friend/chat.js')

    messages.push({ role: 'user', content: '我喜欢打游戏' })
    messages.push({ role: 'friend', content: '哪种游戏？' })
    await friendChat('u1', '', 'nudge') // 第一次 nudge
    expect(messages.filter((m) => m.meta?.nudge === true)).toHaveLength(1)

    // 使用者回话 → 新的沉默开始
    messages.push({ role: 'user', content: '卡牌类' })
    messages.push({ role: 'friend', content: '卡牌类啊，最近哪个上头？' })

    await friendChat('u1', '', 'nudge') // 新沉默的 nudge → 应该允许
    expect(llmJsonMock).toHaveBeenCalledTimes(2)
    expect(messages.filter((m) => m.meta?.nudge === true)).toHaveLength(2)
  })

  it('nudge 不建任务（task_intent 被 LLM 回 true 也忽略）', async () => {
    const { friendChat } = await import('../../server/friend/chat.js')
    llmJsonMock.mockResolvedValue({ reply: '好哦', shared_event_id: null, task_intent: true })

    messages.push({ role: 'user', content: '帮我找人聊聊' })
    messages.push({ role: 'friend', content: '好，我去安排' })

    const r = await friendChat('u1', '', 'nudge')
    expect(r.taskId).toBeNull()
    expect(insertedTaskCalls).toHaveLength(0) // createTaskFromText 与 task_card 都没有发生
  })

  it('一般（非 nudge）模式不受防重复影响，task_intent 正常建任务', async () => {
    const { friendChat } = await import('../../server/friend/chat.js')
    llmJsonMock.mockResolvedValue({ reply: '好的', shared_event_id: null, task_intent: true })

    messages.push({ role: 'friend', content: '嗨' })

    const r = await friendChat('u1', '帮我找 3 个喜欢登山的人聊聊')
    expect(r.taskId).toBe('task-1')
    expect(insertedTaskCalls).toContain('task:帮我找 3 个喜欢登山的人聊聊')
  })
})

// ── 前端计时器规则（纯函数，与 FriendPage useEffect 同逻辑） ──────────────────
type ChatRole = 'user' | 'friend'
interface Msg { id: string; role: ChatRole; meta?: { nudge?: boolean } }

export function scheduleNudge(
  messages: Msg[],
  onNudge: () => void,
  delayMs: number,
  visibility: 'visible' | 'hidden' = 'visible',
): () => void {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'friend') return () => {}
  const lastUserIdx = messages.map((m) => m.role).lastIndexOf('user')
  const afterUser = messages.slice(lastUserIdx + 1)
  if (afterUser.some((m) => m.meta?.nudge === true)) return () => {}
  if (visibility !== 'visible') return () => {}
  const timer = setTimeout(onNudge, delayMs)
  return () => clearTimeout(timer)
}

describe('Nudge 计时器（前端）', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('最后一条 user 之后有 nudge 讯息 → 不再设计时器', () => {
    const onNudge = vi.fn()
    const msgs: Msg[] = [
      { id: 'u1', role: 'user' },
      { id: 'a1', role: 'friend', meta: { nudge: true } },
    ]
    scheduleNudge(msgs, onNudge, 75_000)
    vi.advanceTimersByTime(90_000)
    expect(onNudge).not.toHaveBeenCalled()
  })

  it('使用者回话后（新沉默）→ 计时器正常触发', () => {
    const onNudge = vi.fn()
    const msgs: Msg[] = [
      { id: 'u1', role: 'user' },
      { id: 'a1', role: 'friend', meta: { nudge: true } },
      { id: 'u2', role: 'user' },
      { id: 'a2', role: 'friend' },
    ]
    scheduleNudge(msgs, onNudge, 75_000)
    vi.advanceTimersByTime(74_999)
    expect(onNudge).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onNudge).toHaveBeenCalledOnce()
  })

  it('分頁在背景（visibility=hidden）不发', () => {
    const onNudge = vi.fn()
    const msgs: Msg[] = [{ id: 'a1', role: 'friend' }]
    scheduleNudge(msgs, onNudge, 75_000, 'hidden')
    vi.advanceTimersByTime(120_000)
    expect(onNudge).not.toHaveBeenCalled()
  })

  it('最后一则是 user 讯息 → 不触发', () => {
    const onNudge = vi.fn()
    const msgs: Msg[] = [
      { id: 'a1', role: 'friend' },
      { id: 'u1', role: 'user' },
    ]
    scheduleNudge(msgs, onNudge, 75_000)
    vi.advanceTimersByTime(120_000)
    expect(onNudge).not.toHaveBeenCalled()
  })
})
