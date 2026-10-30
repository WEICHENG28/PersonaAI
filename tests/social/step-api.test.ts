import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../../server/app'
import { setLlmClient } from '../../server/lib/llm'
import { setLogWriter } from '../../server/lib/log'

// 記憶體模式（不接資料庫）＋ C 的 contracts stub：從 API 建任務、確認、手動推進一步
beforeAll(() => {
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  Object.assign(process.env, {
    LLM_BASE_URL: 'https://example.test/v1',
    LLM_API_KEY: 'test',
    MODEL_CHAT: 'c',
    MODEL_REASON: 'r',
    MODEL_FAST: 'f',
    MODEL_EMBED: 'e',
    EMBEDDING_DIM: '2',
  })
  setLogWriter(async () => {})
  setLlmClient({
    chat: async () =>
      JSON.stringify({ purpose: 'sport', conditions: ['喜欢登山'], count: 3, done: {}, restatement: '帮你找 3 位喜欢登山的运动伙伴' }),
    embed: async () => [1, 0],
  })
})

afterAll(() => {
  setLlmClient(null)
  setLogWriter(null)
})

const post = (path: string, body?: unknown) =>
  app.request(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined, headers: { 'content-type': 'application/json' } })

describe('POST /api/tasks/:id/step', () => {
  it('確認後推進一步：從種子用戶裡挑人開始代聊', async () => {
    const created = (await (await post('/api/tasks', { text: '帮我找 3 个喜欢登山的人聊聊' })).json()) as { data: { id: string } }
    const id = created.data.id
    await post(`/api/tasks/${id}/confirm`)

    const res = await post(`/api/tasks/${id}/step`)
    const json = (await res.json()) as { ok: boolean; data: { outcome: string; task: Record<string, unknown> } }
    expect(json.ok).toBe(true)
    expect(json.data.outcome).toBe('started_chat')
    expect(json.data.task).toMatchObject({ status: 'running', active_conversation_id: 'conv-stub-1', progress: { chats: 1 } })
  })

  it('別人的或不存在的任務回 404', async () => {
    expect((await post('/api/tasks/nope/step')).status).toBe(404)
  })
})
