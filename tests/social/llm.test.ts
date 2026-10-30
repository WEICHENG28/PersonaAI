import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { CONFIG } from '../../server/lib/config'
import { LlmError, embed, extractJson, llmJson, llmText, llmTuning, setLlmClient, type LlmClient } from '../../server/lib/llm'
import { setLogWriter, writeLog } from '../../server/lib/log'

beforeAll(() => {
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

afterEach(() => {
  setLlmClient(null)
  setLogWriter(null)
})

/** 依序回傳 replies 的假平台；字串是回覆，Error 會被丟出。 */
function fakeClient(replies: (string | Error)[], vector: number[] = [1, 2, 3, 4]) {
  const calls: Parameters<LlmClient['chat']>[0][] = []
  const client: LlmClient = {
    chat: vi.fn(async (req) => {
      calls.push(req)
      const next = replies.shift()
      if (next instanceof Error) throw next
      return next ?? ''
    }),
    embed: vi.fn(async () => vector),
  }
  setLlmClient(client)
  return { client, calls }
}

const schema = z.object({ name: z.string(), score: z.number() })
const base = { role: 'reason' as const, system: '你是测试', messages: [{ role: 'user' as const, content: '给我 JSON' }] }
const MAX_ATTEMPTS = CONFIG.LLM_MAX_RETRIES + 1

describe('extractJson', () => {
  it('從混雜文字中擷取第一段 JSON', () => {
    expect(extractJson('好的，结果如下：{"a":1,"b":{"c":"}"}} 以上')).toBe('{"a":1,"b":{"c":"}"}}')
  })
  it('支援 ```json 區塊與陣列', () => {
    expect(extractJson('```json\n[1,2]\n```')).toBe('[1,2]')
  })
  it('找不到就回 null', () => {
    expect(extractJson('没有 JSON')).toBeNull()
    expect(extractJson('{"a":')).toBeNull()
  })
})

describe('llmJson', () => {
  it('第一次就合格時直接回傳，並用對應角色的模型與 JSON 模式', async () => {
    const { calls } = fakeClient(['{"name":"阿澈","score":4}'])
    await expect(llmJson({ ...base, schema })).resolves.toEqual({ name: '阿澈', score: 4 })
    expect(calls[0]?.model).toBe('reason-model')
    expect(calls[0]?.jsonMode).toBe(true)
    expect(calls[0]?.messages[0]).toEqual({ role: 'system', content: '你是测试' })
  })

  it('schema 不符時會重試，並告訴模型上次錯在哪', async () => {
    const { calls } = fakeClient(['{"name":"阿澈"}', '{"name":"阿澈","score":5}'])
    await expect(llmJson({ ...base, schema })).resolves.toEqual({ name: '阿澈', score: 5 })
    expect(calls).toHaveLength(2)
    const retryMessages = calls[1]?.messages ?? []
    expect(retryMessages.at(-1)?.content).toContain('上次输出格式错误')
    expect(retryMessages.at(-2)).toEqual({ role: 'assistant', content: '{"name":"阿澈"}' })
  })

  it('逾時等錯誤也會重試', async () => {
    fakeClient([new Error('timeout'), '{"name":"x","score":1}'])
    await expect(llmJson({ ...base, schema })).resolves.toEqual({ name: 'x', score: 1 })
  })

  it(`全部失敗時丟出 LlmError，最多呼叫 ${MAX_ATTEMPTS} 次`, async () => {
    const { calls } = fakeClient(['不是 JSON', '还是不是', '{"score":"高"}', '{"name":"不会用到","score":1}'])
    const err = await llmJson({ ...base, schema }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(LlmError)
    expect(err).toMatchObject({ role: 'reason', attempts: MAX_ATTEMPTS })
    expect(calls).toHaveLength(MAX_ATTEMPTS)
  })
})

describe('同時請求上限', () => {
  it('同時最多 llmTuning.maxConcurrent 個，其他排隊', async () => {
    let now = 0
    let peak = 0
    setLlmClient({
      chat: async () => {
        peak = Math.max(peak, ++now)
        await new Promise((r) => setTimeout(r, 10))
        now--
        return 'ok'
      },
      embed: async () => [1, 2, 3, 4],
    })
    const outs = await Promise.all(Array.from({ length: 6 }, () => llmText({ ...base, role: 'chat' })))
    expect(outs).toEqual(Array(6).fill('ok'))
    expect(peak).toBe(llmTuning.maxConcurrent)
  })
})

describe('llmText', () => {
  it('空字串視為失敗並重試', async () => {
    const { calls } = fakeClient(['', '你好'])
    await expect(llmText({ ...base, role: 'chat' })).resolves.toBe('你好')
    expect(calls[1]?.jsonMode).toBe(false)
    expect(calls[1]?.model).toBe('chat-model')
  })
})

describe('embed', () => {
  it('長度正確時回傳向量', async () => {
    fakeClient([])
    await expect(embed('登山')).resolves.toEqual([1, 2, 3, 4])
  })
  it('長度不符時直接丟錯、不重試', async () => {
    const { client } = fakeClient([], [1, 2])
    await expect(embed('登山')).rejects.toBeInstanceOf(LlmError)
    expect(client.embed).toHaveBeenCalledTimes(1)
  })
})

describe('writeLog', () => {
  it('寫入失敗不會中斷主流程', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    setLogWriter(async () => {
      throw new Error('db down')
    })
    await expect(writeLog({ user_id: 'u1', agent: 'social', action: '测试' })).resolves.toBeUndefined()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})
