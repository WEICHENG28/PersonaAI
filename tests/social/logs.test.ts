import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from '../../server/app'
import { MemoryAgentStore, setAgentStore } from '../../server/social/agentStore'

beforeAll(() => {
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
})

let store: MemoryAgentStore
const log = (id: string, user: string, task: string | null, at: string) => ({
  id,
  user_id: user,
  task_id: task,
  conversation_id: null,
  agent: 'social' as const,
  action: `动作 ${id}`,
  reason: '理由',
  created_at: at,
})

beforeEach(() => {
  store = new MemoryAgentStore()
  store.logs = [
    log('1', 'dev-user', 't1', '2026-10-30T10:00:00Z'),
    log('2', 'dev-user', 't2', '2026-10-30T10:01:00Z'),
    log('3', 'someone-else', 't1', '2026-10-30T10:02:00Z'),
    log('4', 'dev-user', 't1', '2026-10-30T10:03:00Z'),
  ]
  setAgentStore(store)
})
afterEach(() => setAgentStore(null))

const get = async (q = '') => (await (await app.request(`/api/logs${q}`)).json()) as { ok: boolean; data: { id: string }[] }

describe('GET /api/logs', () => {
  it('只回自己的日誌，新的在前，不含 user_id', async () => {
    const json = await get()
    expect(json.data.map((l) => l.id)).toEqual(['4', '2', '1'])
    expect(json.data[0]).not.toHaveProperty('user_id')
  })

  it('依任務篩選、限制筆數', async () => {
    expect((await get('?task_id=t1')).data.map((l) => l.id)).toEqual(['4', '1'])
    expect((await get('?limit=1')).data.map((l) => l.id)).toEqual(['4'])
  })

  it('參數不對回 400', async () => {
    expect((await app.request('/api/logs?limit=0')).status).toBe(400)
  })
})
