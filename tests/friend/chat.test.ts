/**
 * A2 必测：Prompt 1 system 渲染、chat body zod、friendChat 主流程（LLM／DB 全 mock）。
 * LLM 一律 mock（AGENTS.md 规矩）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── mock Supabase（getServiceClient）：每张表一个 chain，存在 tables ──
const tables: Record<string, TableMock> = {}

interface TableMock {
  list: Record<string, unknown>[]
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}

vi.mock('../../server/lib/supabase', () => ({
  getServiceClient: () => ({
    from: (name: string) => tables[name]?.self ?? failTable(name),
  }),
}))
vi.mock('../../server/lib/llm', () => ({
  llmJson: vi.fn(async () => ({
    reply: '听起来不错，你周末想怎么安排？',
    shared_event_id: null,
    task_intent: false,
  })),
}))
vi.mock('../../server/social/task', () => ({
  createTaskFromText: vi.fn(async () => ({
    id: 'task-1', restatement: '帮你找 3 位喜欢登山的运动伙伴', status: 'pending_confirm',
  })),
}))
vi.mock('../../server/lib/log', () => ({ writeLog: vi.fn(async () => {}) }))
vi.mock('../../server/friend/memory', () => ({
  extractMemories: vi.fn(async () => 0),
  listMemories: vi.fn(async () => []),
}))

vi.mock('../../server/friend/profile', () => ({
  countUserChatMessages: vi.fn(async () => 1),
  shouldExtractProfile: (n: number) => n > 0 && n % 6 === 0,
  extractProfile: vi.fn(async () => ({})),
}))
import { countUserChatMessages, extractProfile } from '../../server/friend/profile'

vi.mock('../../server/social/usage', () => ({ assertWithinDailyLimit: vi.fn(async () => {}) }))
import { assertWithinDailyLimit } from '../../server/social/usage'
import { listMemories } from '../../server/friend/memory'

import { llmJson } from '../../server/lib/llm'
import { createTaskFromText } from '../../server/social/task'
import { chatBodySchema, friendChat, friendIntro } from '../../server/friend/chat'
import { renderFriendSystem, friendReplySchema } from '../../server/prompts/01_friend'
import { ACHE, pickNextEvent } from '../../server/friend/persona'
import { writeLog } from '../../server/lib/log'

function makeTable(name: string): TableMock {
  const t: TableMock = {
    list: [],
    select: vi.fn(() => t.self),
    eq: vi.fn(() => t.self),
    order: vi.fn(() => t.self),
    limit: vi.fn(async () => ({ data: t.list, error: null })),
    maybeSingle: vi.fn(async () => ({ data: t.list[0] ?? null, error: null })),
    single: vi.fn(async () =>
      t.list[0] ? { data: t.list[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } },
    ),
    insert: vi.fn((row: Record<string, unknown> | Record<string, unknown>[]) => {
      const rows = (Array.isArray(row) ? row : [row]).map((value, n) => ({ id: `msg-${t.list.length + n}`, created_at: new Date().toISOString(), ...value }))
      t.list.push(...rows)
      return { select: () => ({ single: async () => ({ data: rows[0], error: null }) }) }
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

const friendRow = {
  story_stage: 0,
  life_state: { mood: '有点忙', doing: '犹豫要不要去周末展' },
  shared_event_ids: [] as string[],
  intro_done: true,
  user_id: 'u1',
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(tables)) delete tables[k]
  makeTable('ai_friends').list.push(structuredClone(friendRow))
  makeTable('friend_messages')
  makeTable('users').list.push({ id: 'u1' })
})

describe('chatBodySchema', () => {
  it('1–1000 字有效', () => {
    expect(chatBodySchema.parse({ text: '你好' })).toEqual({ text: '你好' })
  })
  it('空字符串拒', () => {
    expect(() => chatBodySchema.parse({ text: '' })).toThrow()
    expect(() => chatBodySchema.parse({ text: ' '.repeat(5) })).toThrow()
  })
  it('超过 1000 字拒', () => {
    expect(() => chatBodySchema.parse({ text: 'a'.repeat(1001) })).toThrow()
  })
})

describe('renderFriendSystem', () => {
  it('所有占位符都被替换', () => {
    const sys = renderFriendSystem({
      lifeState: '有点忙；犹豫要不要去周末展',
      eventText: '我本来想周末去看展…',
      recallMemory: '无',
      memories: '（还没有长期记忆）',
      crisisResource: '（依地区填写求助专线）',
    })
    for (const ph of ['{{life_state}}', '{{event_text}}', '{{recall_memory}}', '{{memories}}', '{{crisis_resource}}']) {
      expect(sys).not.toContain(ph)
    }
    expect(sys).toContain('阿澈')
    expect(sys).toContain('有点忙')
  })
})

describe('friendReplySchema', () => {
  it('shared_event_id null 与缺省都规范化为 null', () => {
    expect(friendReplySchema.parse({ reply: '嗨', shared_event_id: null, task_intent: false }).shared_event_id).toBeNull()
    expect(friendReplySchema.parse({ reply: '嗨', task_intent: false }).shared_event_id).toBeNull()
  })
})

describe('friendChat 主流程（mock）', () => {
  it('attributes delayed message inserts to db.write and friend initialization to setup', async () => {
    let clock = 0
    const clockSpy = vi.spyOn(performance, 'now').mockImplementation(() => clock)
    const friends = tables['ai_friends']!
    friends.list.length = 0
    const originalFriendInsert = friends.insert.getMockImplementation()!
    friends.insert.mockImplementation(row => {
      clock += 20
      return originalFriendInsert(row)
    })
    const messages = tables['friend_messages']!
    const originalMessageInsert = messages.insert.getMockImplementation()!
    messages.insert.mockImplementation(row => {
      clock += row.role === 'user' ? 40 : 10
      return originalMessageInsert(row)
    })
    try {
      await friendChat('u1', '你好')
      const log = vi.mocked(writeLog).mock.calls.map(([entry]) => entry).find(entry => entry.action === '回应用户')!
      expect(log.detail!.timing).toMatchObject({ setup: 20, 'db.read': 0, 'db.write': 50, totalMs: 70 })
    } finally {
      clockSpy.mockRestore()
    }
  })

  it('records reply metrics and phase timings while retaining taskId in the response log', async () => {
    const metric = { tag: 'friend.reply', role: 'chat' as const, model: 'mock', lane: 'fg' as const,
      stream: false, ok: true, attempts: 1, queueMs: 0, ttftMs: null, totalMs: 2,
      promptTokens: 3, completionTokens: 2 }
    vi.mocked(llmJson).mockImplementationOnce(async opts => {
      opts.onMetric?.(metric)
      return { reply: '好，我去找', shared_event_id: null, task_intent: true } as never
    })
    await friendChat('u1', '帮我找人')
    const log = vi.mocked(writeLog).mock.calls.map(([entry]) => entry).find(entry => entry.action === '回应用户')!
    expect(log.detail).toMatchObject({ taskId: 'task-1', llm: metric })
    const timing = log.detail!.timing as Record<string, number>
    for (const key of ['db.read', 'llm', 'db.write', 'totalMs']) expect(timing[key]).toBeGreaterThanOrEqual(0)
    expect(vi.mocked(llmJson).mock.calls[0]![0].tag).toBe('friend.reply')
  })

  it('普通对话：存两条讯息、无任务卡', async () => {
    const out = await friendChat('u1', '我周末想去漫展')
    expect(out.reply).toContain('周末')
    expect(out.taskId).toBeNull()
    expect(tables['friend_messages']!.list).toHaveLength(2)
    expect(tables['friend_messages']!.list[0]).toMatchObject({ role: 'user', content: '我周末想去漫展' })
    expect(tables['friend_messages']!.list[1]).toMatchObject({ role: 'friend' })
    expect(createTaskFromText).not.toHaveBeenCalled()
  })

  it('task_intent=true：调用 B 的 createTaskFromText 并写 task_card', async () => {
    vi.mocked(llmJson).mockResolvedValueOnce({
      reply: '好呀，我请社交 Agent 去找，你看看任务确认卡。',
      shared_event_id: null,
      task_intent: true,
    } as never)
    const out = await friendChat('u1', '帮我找 3 个喜欢登山的人聊聊')
    expect(out.taskId).toBe('task-1')
    expect(createTaskFromText).toHaveBeenCalledWith('u1', '帮我找 3 个喜欢登山的人聊聊')
    expect(tables['friend_messages']!.list.at(-1)).toMatchObject({ kind: 'task_card', meta: { taskId: 'task-1' } })
  })

  it('用户同意「要不要帮你找人」时，用模型整理好的 task_text 建任务（不是「好啊」）', async () => {
    vi.mocked(llmJson).mockResolvedValueOnce({
      reply: '好，我请社交 Agent 帮你找几个周六一起滑雪的人。',
      shared_event_id: null,
      task_intent: true,
      task_text: '帮我找几个周六一起去滑雪的人',
    } as never)
    await friendChat('u1', '好啊')
    expect(createTaskFromText).toHaveBeenCalledWith('u1', '帮我找几个周六一起去滑雪的人')
  })

  it('shared_event_id：记入 ai_friends.shared_event_ids', async () => {
    vi.mocked(llmJson).mockResolvedValueOnce({
      reply: '我投的同人图被选上了！替你开心吗',
      shared_event_id: 'e2_fanart',
      task_intent: false,
    } as never)
    await friendChat('u1', '哈哈真棒')
    expect(tables['ai_friends']!.list[0]).toMatchObject({ shared_event_ids: ['e2_fanart'] })
  })

  it('B 的解析失败不中断聊天', async () => {
    vi.mocked(llmJson).mockResolvedValueOnce({
      reply: '好，我去找',
      shared_event_id: null,
      task_intent: true,
    } as never)
    vi.mocked(createTaskFromText).mockRejectedValueOnce(new Error('LLM down') as never)
    const out = await friendChat('u1', '帮我找 3 个喜欢登山的人聊聊')
    expect(out.taskId).toBeNull()
    expect(out.reply).toBe('好，我去找')
  })

  it('新用户（无 ai_friends 行）自动建行', async () => {
    tables['ai_friends']!.list.length = 0
    const out = await friendChat('u1', '你好')
    expect(out.reply).toBeTruthy()
    expect(tables['ai_friends']!.list).toHaveLength(1)
    expect(tables['ai_friends']!.list[0]).toMatchObject({ story_stage: 0, intro_done: false })
  })
})

describe('friendIntro', () => {
  it('intro_done=false：写 intro + 轻事件两条并置位', async () => {
    tables['ai_friends']!.list[0] = { ...structuredClone(friendRow), intro_done: false }
    await friendIntro('u1')
    const msgs = tables['friend_messages']!.list
    expect(msgs[0]).toMatchObject({ kind: 'intro', content: ACHE.intro })
    expect(msgs[1]).toMatchObject({ kind: 'chat', content: pickNextEvent(0, [])!.line })
    expect(tables['ai_friends']!.list[0]).toMatchObject({ intro_done: true })
  })

  it('intro_done=true：幂等，不再写', async () => {
    await friendIntro('u1')
    expect(tables['friend_messages']!.list).toHaveLength(0)
  })
})

it('extracts profile at full count 12 despite only ten recent user messages', async () => {
  tables.friend_messages!.limit.mockResolvedValue({ data: Array.from({ length: 10 }, () => ({ role: 'user', kind: 'chat', content: 'hi' })), error: null })
  vi.mocked(countUserChatMessages).mockResolvedValueOnce(12)
  await friendChat('u1', 'hello')
  expect(countUserChatMessages).toHaveBeenCalledWith('u1')
  expect(extractProfile).toHaveBeenCalledWith('u1')
})

it('does not block the chat reply while the exact count is pending', async () => {
  let release!: (value: number) => void
  vi.mocked(countUserChatMessages).mockImplementationOnce(() => new Promise<number>(resolve => { release = resolve }))
  let completed = false
  const response = friendChat('u1', 'hello').then(() => { completed = true })
  try {
    await vi.waitFor(() => expect(countUserChatMessages).toHaveBeenCalled())
    expect(completed).toBe(true)
    expect(extractProfile).not.toHaveBeenCalled()
  } finally { release(12); await response }
  await vi.waitFor(() => expect(extractProfile).toHaveBeenCalledWith('u1'))
})

it('returns inserted user/friend rows and keeps timing/llm in the pending background log', async () => {
  const realLog = vi.mocked(writeLog).getMockImplementation()!
  const tasks: Promise<unknown>[] = []
  const key = Symbol.for('@vercel/request-context')
  const previous = (globalThis as Record<symbol, unknown>)[key]
  ;(globalThis as Record<symbol, unknown>)[key] = { get: () => ({ waitUntil: (p: Promise<unknown>) => tasks.push(p) }) }
  let release!: () => void
  const logTask = new Promise<void>(resolve => { release = resolve })
  const metric = { tag: 'friend.reply', role: 'chat' as const, model: 'mock', lane: 'fg' as const, stream: false, ok: true, attempts: 1, queueMs: 0, ttftMs: null, totalMs: 2, promptTokens: 3, completionTokens: 2 }
  vi.mocked(llmJson).mockImplementationOnce(async opts => { opts.onMetric?.(metric); return { reply: 'hello', task_intent: false, shared_event_id: null } as never })
  vi.mocked(writeLog).mockImplementation(entry => entry.action === '回应用户' ? logTask : realLog(entry))
  try {
    const out = await friendChat('u1', '你好')
    expect(out.messages).toHaveLength(2)
    expect(out.messages?.[1]).toMatchObject({ role: 'friend', id: expect.any(String), created_at: expect.any(String) })
    const log = vi.mocked(writeLog).mock.calls.map(([e]) => e).find(e => e.action === '回应用户')!
    expect(log.detail).toMatchObject({ timing: { totalMs: expect.any(Number) }, llm: metric })
    expect(tasks.length).toBeGreaterThan(0)
    let finished = false; void tasks[0]!.then(() => { finished = true })
    await Promise.resolve(); expect(finished).toBe(false)
  } finally { release(); (globalThis as Record<symbol, unknown>)[key] = previous; vi.mocked(writeLog).mockImplementation(realLog) }
})
it('merges concurrent history and inserted message without duplicates', async () => {
  const { mergeHistory } = await import('../../server/friend/chat.js')
  const a = { id: 'a', role: 'user' as const, kind: 'chat', content: 'a', meta: {}, created_at: '2026-11-07T00:00:00Z' }
  const b = { ...a, id: 'b', created_at: '2026-11-07T00:00:01Z' }
  expect(mergeHistory([b, a], b, 1)).toEqual([b])
})

it('runs independent setup/context queries concurrently, commits events after reply and keeps count in background', async () => {
  const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r }); return { promise, resolve } }
  const usage = deferred(), init = deferred(), user = deferred(), history = deferred(), memories = deferred(), reply = deferred(), event = deferred()
  vi.mocked(assertWithinDailyLimit).mockImplementationOnce(() => usage.promise)
  tables.ai_friends!.maybeSingle.mockImplementationOnce(async () => { await init.promise; return { data: structuredClone(friendRow), error: null } })
  const original = tables.friend_messages!.insert.getMockImplementation()!
  tables.friend_messages!.insert.mockImplementation(row => {
    const saved = original(row)
    return { select: () => ({ single: async () => {
      await (row.role === 'user' ? user.promise : reply.promise)
      return saved.select().single()
    } }) }
  })
  tables.friend_messages!.limit.mockImplementationOnce(async () => { await history.promise; return { data: [], error: null } })
  vi.mocked(listMemories).mockImplementationOnce(async () => { await memories.promise; return [] })
  tables.ai_friends!.update.mockImplementationOnce(() => ({ eq: () => event.promise }))
  vi.mocked(llmJson).mockResolvedValueOnce({ reply: 'hi', task_intent: false, shared_event_id: 'e2_fanart' } as never)
  vi.mocked(countUserChatMessages).mockImplementationOnce(() => new Promise<number>(() => {}))
  let completed = false
  const response = friendChat('u1', '你好').then(() => { completed = true })
  expect(assertWithinDailyLimit).toHaveBeenCalled()
  expect(tables.ai_friends!.maybeSingle).toHaveBeenCalled()
  init.resolve(); usage.resolve()
  await vi.waitFor(() => {
    expect(tables.friend_messages!.insert).toHaveBeenCalledTimes(1)
    expect(tables.friend_messages!.limit).toHaveBeenCalled()
    expect(listMemories).toHaveBeenCalled()
  })
  history.resolve(); memories.resolve()
  expect(llmJson).not.toHaveBeenCalled()
  user.resolve()
  await vi.waitFor(() => expect(tables.friend_messages!.insert).toHaveBeenCalledTimes(2))
  expect(tables.ai_friends!.update).not.toHaveBeenCalled()
  reply.resolve()
  await vi.waitFor(() => expect(tables.ai_friends!.update).toHaveBeenCalled())
  expect(completed).toBe(false)
  event.resolve(); await response
  expect(completed).toBe(true)
  expect(countUserChatMessages).toHaveBeenCalled()
})

it('does not consume a shared event when reply insert fails', async () => {
  const original = tables.friend_messages!.insert.getMockImplementation()!
  tables.friend_messages!.insert.mockImplementation(row => row.role === 'friend'
    ? { select: () => ({ single: async () => ({ data: null, error: { message: 'save failed' } }) }) }
    : original(row))
  vi.mocked(llmJson).mockResolvedValueOnce({ reply: 'hi', task_intent: false, shared_event_id: 'e2_fanart' } as never)
  await expect(friendChat('u1', 'hello')).rejects.toThrow('保存回复失败')
  expect(tables.ai_friends!.update).not.toHaveBeenCalled()
})
