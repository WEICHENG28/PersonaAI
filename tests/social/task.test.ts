import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { AgentLogInput } from '../../shared/types'
import { app } from '../../server/app'
import { setLlmClient } from '../../server/lib/llm'
import { setLogWriter } from '../../server/lib/log'
import { normalizeParsed } from '../../server/social/task'
import { createMemoryTaskStore, setTaskStore } from '../../server/social/taskStore'

beforeAll(() => {
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  Object.assign(process.env, {
    LLM_BASE_URL: 'https://example.test/v1',
    LLM_API_KEY: 'test',
    MODEL_CHAT: 'chat-model',
    MODEL_REASON: 'reason-model',
    MODEL_FAST: 'fast-model',
    MODEL_EMBED: 'embed-model',
    EMBEDDING_DIM: '4',
  })
})

const HIKING = {
  purpose: 'sport',
  conditions: ['喜欢登山'],
  count: 3,
  done: { suitable_count: 2, max_chats: 6, deadline: null },
  restatement: '帮你找 3 位喜欢登山的运动伙伴，找到 2 位合适就停，最多代聊 6 场，可以吗？',
}

let logs: AgentLogInput[] = []
let prompts: string[] = []

/** 假模型：每次都回傳 reply，並記下送進去的 prompt。 */
function fakeModel(reply: unknown) {
  setLlmClient({
    async chat(req) {
      prompts.push(req.messages.map((m) => m.content).join('\n'))
      return JSON.stringify(reply)
    },
    async embed() {
      return []
    },
  })
}

beforeEach(() => {
  logs = []
  prompts = []
  setLogWriter(async (e) => {
    logs.push(e)
  })
  setTaskStore(createMemoryTaskStore())
})

afterEach(() => {
  setLlmClient(null)
  setLogWriter(null)
  setTaskStore(null)
})

const post = (path: string, body?: unknown) =>
  app.request(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined, headers: { 'content-type': 'application/json' } })

describe('normalizeParsed', () => {
  it('模型漏給數字時照 Prompt 14 的預設補上', () => {
    const p = normalizeParsed({ purpose: 'sport', conditions: [' 喜欢登山 ', ''], done: {}, restatement: ' 好 ' })
    expect(p).toEqual({
      purpose: 'sport',
      conditions: ['喜欢登山'],
      count: 3,
      done: { suitable_count: 2, max_chats: 6, deadline: null },
      restatement: '好',
    })
  })

  it('人數上限 10，合適人數不超過總人數', () => {
    const p = normalizeParsed({ purpose: 'friend', conditions: [], count: 50, done: { suitable_count: 99 }, restatement: 'x' })
    expect(p.count).toBe(10)
    expect(p.done.suitable_count).toBe(10)
    expect(p.done.max_chats).toBe(20)
  })
})

describe('POST /api/tasks（驗收 1：登山任務）', () => {
  it('解析為 sport、喜欢登山、3 人、2 位合適就停、最多代聊 6 場，狀態待確認並寫日誌', async () => {
    fakeModel(HIKING)
    const res = await post('/api/tasks', { text: '帮我找 3 个喜欢登山的人聊聊' })
    expect(res.status).toBe(200)
    const { data } = (await res.json()) as { data: Record<string, unknown> }
    expect(data).toMatchObject({
      purpose: 'sport',
      conditions: ['喜欢登山'],
      target_count: 3,
      done_condition: { suitable_count: 2, max_chats: 6, deadline: null },
      status: 'pending_confirm',
      raw_instruction: '帮我找 3 个喜欢登山的人聊聊',
    })
    expect(prompts[0]).toContain('帮我找 3 个喜欢登山的人聊聊')
    expect(logs[0]?.action).toContain('收到任务')
  })

  it('空白指令回 400 與中文提示，不呼叫模型', async () => {
    fakeModel(HIKING)
    const res = await post('/api/tasks', { text: '   ' })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ ok: false })
    expect(prompts).toHaveLength(0)
  })

  it('模型一直給壞格式時回 503 與好懂的訊息', async () => {
    fakeModel({ nonsense: true })
    const res = await post('/api/tasks', { text: '帮我找人' })
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ ok: false, error: 'AI 暂时没有回应，请稍后再试' })
  })
})

describe('任務狀態', () => {
  async function createTask() {
    fakeModel(HIKING)
    const res = await post('/api/tasks', { text: '帮我找 3 个喜欢登山的人聊聊' })
    return ((await res.json()) as { data: { id: string } }).data.id
  }

  it('確認後變成 running，可以暫停、繼續、取消', async () => {
    const id = await createTask()
    for (const [action, status] of [['confirm', 'running'], ['pause', 'paused'], ['resume', 'running'], ['cancel', 'cancelled']]) {
      const res = await post(`/api/tasks/${id}/${action}`)
      expect(await res.json()).toMatchObject({ ok: true, data: { status } })
    }
  })

  it('驗收 2：沒確認對外檔案時按「開始」會看到明確的中文提示', async () => {
    setTaskStore(createMemoryTaskStore({ socialAgentEnabled: true, shareableConfirmed: false }))
    const id = await createTask()
    const res = await post(`/api/tasks/${id}/confirm`)
    expect(res.status).toBe(403)
    // 只缺檔案時只叫他去我的檔案（不再連帶說去設定）
    expect(await res.json()).toEqual({ ok: false, error: '先到「我的档案」确认对外档案' })
  })

  it('不合法的轉換會被擋下', async () => {
    const id = await createTask()
    const res = await post(`/api/tasks/${id}/pause`)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ ok: false, error: '这个任务目前不能暂停' })
  })

  it('查不到的任務回 404', async () => {
    const res = await app.request('/api/tasks/nope')
    expect(res.status).toBe(404)
  })
})
