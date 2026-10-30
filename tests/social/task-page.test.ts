import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '../../server/app'
import { setLogWriter } from '../../server/lib/log'
import { MemoryAgentStore, setAgentStore } from '../../server/social/agentStore'
import { createMemoryTaskStore, setTaskStore, type TaskStore } from '../../server/social/taskStore'

beforeAll(() => {
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
})

let tasks: TaskStore
const base = {
  kind: 'search' as const,
  raw_instruction: '帮我找人',
  restatement: '帮你找 3 位运动伙伴',
  purpose: 'sport' as const,
  conditions: ['喜欢登山'],
  target_count: 3,
  done_condition: { suitable_count: 2 },
  target_user_id: null,
  status: 'running' as const,
}

beforeEach(() => {
  tasks = createMemoryTaskStore()
  setTaskStore(tasks)
  const store = new MemoryAgentStore()
  store.settings = { ...store.settings, manual_minutes_per_chat: 30 }
  setAgentStore(store)
  setLogWriter(async () => {})
})
afterEach(() => {
  setTaskStore(null)
  setAgentStore(null)
  setLogWriter(null)
})

const json = async (path: string) => (await (await app.request(path)).json()) as { ok: boolean; data: unknown; error?: string }

describe('GET /api/tasks', () => {
  it('只列自己的任務，新的在前', async () => {
    await tasks.insert({ ...base, user_id: 'dev-user', restatement: '第一个' })
    await tasks.insert({ ...base, user_id: 'someone-else' })
    await tasks.insert({ ...base, user_id: 'dev-user', restatement: '第二个' })
    const res = await json('/api/tasks')
    expect((res.data as { restatement: string }[]).map((t) => t.restatement)).toEqual(['第二个', '第一个'])
  })
})

describe('GET /api/tasks/:id/stats', () => {
  it('依用戶的人工平均分鐘算省下的時間', async () => {
    const task = await tasks.insert({ ...base, user_id: 'dev-user' })
    const res = await json(`/api/tasks/${task.id}/stats`)
    expect(res).toMatchObject({ ok: true, data: { chats: 0, saved_minutes: 0, basis: '代聊 0 场 × 人工平均 30 分钟' } })
  })

  it('別人的任務回 404', async () => {
    const task = await tasks.insert({ ...base, user_id: 'someone-else' })
    expect((await app.request(`/api/tasks/${task.id}/stats`)).status).toBe(404)
  })
})
