import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../../server/app'
import { setLogWriter } from '../../server/lib/log'
import { MemoryAgentStore, setAgentStore } from '../../server/social/agentStore'
import { buildInsight, reopenAttempt } from '../../server/social/history'
import { setTaskStore } from '../../server/social/taskStore'

beforeAll(() => {
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
})

let store: MemoryAgentStore
const outline = { topics: ['登山'], fits: [], frictions: [], highlights: [], fit_points: [] }

async function seed(result: 'mutual' | 'unsuitable', reason: 'friction' | 'not_mutual' | null = null, user = 'dev-user') {
  await store.recordAttempt({
    user_id: user,
    target_user_id: 'xiaoan',
    conversation_id: 'conv-1',
    task_id: 't1',
    origin: 'auto',
    result,
    reason_type: reason,
    reason_text: reason ? '节奏没对上' : null,
    outline,
  })
}

beforeEach(() => {
  store = new MemoryAgentStore()
  setAgentStore(store)
  setLogWriter(async () => {})
})
afterEach(() => {
  setAgentStore(null)
  setTaskStore(null)
  setLogWriter(null)
})

describe('buildInsight', () => {
  it('不合適少於 3 筆不顯示', () => {
    expect(buildInsight([{ result: 'unsuitable', reason_type: 'friction' }])).toBeNull()
  })
  it('3 筆以上：統計最多的原因', () => {
    const rows = [
      { result: 'unsuitable' as const, reason_type: 'friction' as const },
      { result: 'mutual' as const, reason_type: null },
      { result: 'unsuitable' as const, reason_type: 'friction' as const },
      { result: 'unsuitable' as const, reason_type: 'not_mutual' as const },
    ]
    expect(buildInsight(rows)).toBe('最近 3 次没成的里面，有 2 次是聊天的节奏没对上。这不是谁的错，只是刚好不同步。')
  })
})

describe('GET /api/history', () => {
  it('只回自己的紀錄、新的在前、不含分數與 user_id', async () => {
    await seed('unsuitable', 'friction')
    await seed('mutual')
    await seed('mutual', null, 'someone-else')
    const json = (await (await app.request('/api/history')).json()) as { data: { items: Record<string, unknown>[]; insight: string | null } }
    expect(json.data.items.map((i) => i.result)).toEqual(['mutual', 'unsuitable'])
    expect(json.data.items[0]).not.toHaveProperty('user_id')
    expect(JSON.stringify(json.data)).not.toMatch(/score/)
    expect(json.data.insight).toBeNull()
  })
})

describe('重啟對話', () => {
  it('request_human → 本人開聊，並通知對方本人（格式同 C7），記下 reopened_at', async () => {
    await seed('unsuitable', 'friction')
    const startConversation = vi.fn(async () => ({ conversationId: 'conv-7' }))
    const r = await reopenAttempt('dev-user', 'attempt-1', 'request_human', { store, startConversation })
    expect(r).toEqual({ mode: 'request_human', conversationId: 'conv-7' })
    expect(startConversation).toHaveBeenCalledWith(expect.objectContaining({ aController: 'human', origin: 'manual' }))
    expect(store.notifications).toEqual([{ userId: 'xiaoan', type: 'request_human', payload: { conversationId: 'conv-7', fromName: 'dev-user' } }])
    expect(store.attempts[0]?.reopened_at).not.toBeNull()
  })

  it('human → 本人直接開聊，回傳對話 ID', async () => {
    await seed('unsuitable', 'friction')
    const startConversation = vi.fn(async () => ({ conversationId: 'conv-9' }))
    const r = await reopenAttempt('dev-user', 'attempt-1', 'human', { store, startConversation })
    expect(r).toEqual({ mode: 'human', conversationId: 'conv-9' })
    expect(startConversation).toHaveBeenCalledWith({ aUserId: 'dev-user', bUserId: 'xiaoan', aController: 'human', origin: 'manual' })
    expect(store.notifications).toEqual([])
  })

  it('API：別人的紀錄回 404；mode 不對回 400', async () => {
    await seed('unsuitable', 'friction', 'someone-else')
    const post = (body: unknown) => app.request('/api/history/attempt-1/reopen', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
    expect((await post({ mode: 'human' })).status).toBe(404)
    expect((await post({ mode: 'twin' })).status).toBe(400)
  })
})
