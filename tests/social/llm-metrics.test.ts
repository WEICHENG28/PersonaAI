import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { llmText, llmJson, embed, llmTuning, setLlmClient } from '../../server/lib/llm/index.js'
import { emitLlmMetric, setLlmMetricSink, type LlmMetric } from '../../server/lib/llm/metrics.js'
import { startTimer } from '../../server/lib/timing.js'
import { CONFIG } from '../../server/lib/config.js'

const opts = { role: 'chat' as const, tag: 'test', system: '测试', messages: [] }
const metric: LlmMetric = { tag: 'test', role: 'chat', model: 'chat-model', lane: 'fg', stream: false,
  ok: true, attempts: 1, queueMs: 0, ttftMs: null, totalMs: 5, promptTokens: 3, completionTokens: 2 }
let metrics: LlmMetric[]

beforeEach(() => {
  for (const [key, value] of Object.entries({ LLM_BASE_URL: 'https://example.test/v1', LLM_API_KEY: 'test',
    MODEL_CHAT: 'chat-model', MODEL_REASON: 'reason-model', MODEL_FAST: 'fast-model',
    MODEL_EMBED: 'embed-model', EMBEDDING_DIM: '4' })) vi.stubEnv(key, value)
  metrics = []
  setLlmMetricSink(m => metrics.push(m))
  setLlmClient({ chat: async () => ({ content: '你好', usage: { promptTokens: 3, completionTokens: 2 } }),
    embed: async () => [1, 2, 3, 4] })
})

afterEach(() => {
  setLlmClient(null); setLlmMetricSink(null)
  llmTuning.maxConcurrent = 3
  vi.restoreAllMocks(); vi.unstubAllEnvs()
})

describe('logical LLM call metrics', () => {
  it('emits one success metric with usage and delivers the per-call callback', async () => {
    const onMetric = vi.fn()
    await expect(llmText({ ...opts, onMetric })).resolves.toBe('你好')
    expect(metrics).toHaveLength(1)
    expect(metrics[0]).toMatchObject({ ok: true, attempts: 1, completionTokens: 2,
      promptTokens: 3, tag: 'test', role: 'chat', model: 'chat-model', lane: 'fg', stream: false, ttftMs: null })
    expect(metrics[0]!.totalMs).toBeGreaterThanOrEqual(0)
    expect(onMetric).toHaveBeenCalledWith(metrics[0])
  })

  it('preserves legacy string text and JSON results with unknown token counts', async () => {
    setLlmClient({ chat: async req => req.jsonMode ? '{"name":"阿澈"}' : '你好', embed: async () => [] })
    await expect(llmText(opts)).resolves.toBe('你好')
    await expect(llmJson({ ...opts, schema: z.object({ name: z.string() }) })).resolves.toEqual({ name: '阿澈' })
    expect(metrics).toHaveLength(2)
    expect(metrics.every(m => m.ok && m.promptTokens === null && m.completionTokens === null)).toBe(true)
  })

  it('counts validation retries and sums usage from all returned responses', async () => {
    const chat = vi.fn()
      .mockResolvedValueOnce({ content: '{"name":1}', usage: { promptTokens: 3, completionTokens: 2 } })
      .mockResolvedValueOnce({ content: '{"name":"阿澈"}', usage: { promptTokens: 5, completionTokens: 4 } })
    setLlmClient({ chat, embed: async () => [] })
    await expect(llmJson({ ...opts, schema: z.object({ name: z.string() }) })).resolves.toEqual({ name: '阿澈' })
    expect(metrics).toHaveLength(1)
    expect(metrics[0]).toMatchObject({ ok: true, attempts: 2, promptTokens: 8, completionTokens: 6 })
  })

  it('emits failure after retry exhaustion without copying provider secrets or input/output', async () => {
    setLlmClient({ chat: async () => { throw new Error('secret-output sk-private https://private.invalid') }, embed: async () => [] })
    await expect(llmText(opts)).rejects.toMatchObject({ attempts: CONFIG.LLM_MAX_RETRIES + 1 })
    expect(metrics).toHaveLength(1)
    expect(metrics[0]).toMatchObject({ ok: false, attempts: CONFIG.LLM_MAX_RETRIES + 1 })
    expect(JSON.stringify(metrics)).not.toMatch(/secret-output|sk-private|private\.invalid|测试/)
  })

  it('also emits failure when all JSON validation attempts fail', async () => {
    setLlmClient({ chat: async () => 'not JSON', embed: async () => [] })
    await expect(llmJson({ ...opts, schema: z.object({ name: z.string() }) })).rejects.toThrow()
    expect(metrics).toHaveLength(1)
    expect(metrics[0]).toMatchObject({ ok: false, attempts: 3, tag: 'test' })
  })

  it('emits embed success and dimension mismatch failure without adding a retry', async () => {
    await expect(embed('登山')).resolves.toEqual([1, 2, 3, 4])
    const bad = vi.fn(async () => [1])
    setLlmClient({ chat: async () => '', embed: bad })
    await expect(embed('登山')).rejects.toThrow()
    expect(bad).toHaveBeenCalledOnce()
    expect(metrics).toEqual([
      expect.objectContaining({ role: 'embed', model: 'embed-model', ok: true, attempts: 1, promptTokens: null }),
      expect.objectContaining({ role: 'embed', ok: false, attempts: 1, promptTokens: null }),
    ])
  })

  it('retains embedding usage including zero and usage consumed by invalid dimensions', async () => {
    const provider = vi.fn()
      .mockResolvedValueOnce({ vector: [1, 2, 3, 4], usage: { promptTokens: 0 } })
      .mockResolvedValueOnce({ vector: [1], usage: { promptTokens: 7 } })
    setLlmClient({ chat: async () => '', embed: provider })
    await expect(embed('登山')).resolves.toEqual([1, 2, 3, 4])
    await expect(embed('登山')).rejects.toThrow()
    expect(provider).toHaveBeenCalledTimes(2)
    expect(metrics).toEqual([
      expect.objectContaining({ role: 'embed', ok: true, attempts: 1, promptTokens: 0, completionTokens: null }),
      expect.objectContaining({ role: 'embed', ok: false, attempts: 1, promptTokens: 7, completionTokens: null }),
    ])
  })

  it('records queued time separately from the first request execution time', async () => {
    let clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
    llmTuning.maxConcurrent = 1
    let release!: (value: string) => void
    const chat = vi.fn().mockImplementationOnce(() => new Promise<string>(r => { release = r }))
      .mockResolvedValue('second')
    setLlmClient({ chat, embed: async () => [] })
    const first = llmText({ ...opts, tag: 'first' })
    clock = 10
    const second = llmText({ ...opts, tag: 'second' })
    expect(chat).toHaveBeenCalledOnce()
    clock = 40
    release('first')
    await Promise.all([first, second])
    expect(metrics.find(m => m.tag === 'second')).toMatchObject({ queueMs: 30, totalMs: 30 })
    expect(metrics.find(m => m.tag === 'first')).toMatchObject({ queueMs: 0, totalMs: 40 })
  })

  it('does not turn observer failures into failed/retried LLM calls', async () => {
    const chat = vi.fn(async () => 'ok')
    setLlmClient({ chat, embed: async () => [] })
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setLlmMetricSink(() => { throw new Error('observer secret') })
    await expect(llmText({ ...opts, onMetric: () => { throw new Error('callback secret') } })).resolves.toBe('ok')
    expect(chat).toHaveBeenCalledOnce()
    expect(warning).toHaveBeenCalled()
    expect(JSON.stringify(warning.mock.calls)).not.toContain('secret')
  })
})

describe('metric output controls', () => {
  it('writes exactly one structured default console line', () => {
    setLlmMetricSink(null)
    vi.stubEnv('LLM_METRICS_LOG', '1')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    emitLlmMetric(metric)
    expect(log).toHaveBeenCalledOnce()
    expect(JSON.parse(log.mock.calls[0]![0] as string)).toEqual({ type: 'llm_metric', ...metric })
  })

  it('disables default console logging while explicit collectors still work', () => {
    vi.stubEnv('LLM_METRICS_LOG', '0')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    emitLlmMetric(metric)
    expect(metrics).toEqual([metric])
    setLlmMetricSink(null)
    emitLlmMetric(metric)
    expect(log).not.toHaveBeenCalled()
  })
})

describe('phase timer', () => {
  it('records elapsed spans, repeated labels and independent snapshots', () => {
    let clock = 10
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
    const timer = startTimer()
    clock = 25; timer.mark('db')
    clock = 40; timer.mark('llm')
    clock = 45; timer.mark('db')
    expect(timer.spans()).toEqual({ db: 20, llm: 15 })
    expect(timer.spans().db).toBeGreaterThanOrEqual(0)
    const snapshot = timer.spans()
    snapshot.db = -1
    expect(timer.spans().db).toBe(20)
    expect(timer.totalMs()).toBe(35)
  })
})

it('uses the last failure category and rounds elapsed milliseconds', async () => {
  let now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const chat = vi.fn().mockRejectedValueOnce(Object.assign(new Error('private'), { status: 401 }))
    .mockImplementation(async () => { now = 2.6; throw Object.assign(new Error('private'), { status: 429 }) })
  setLlmClient({ chat, embed: async () => [] })
  await expect(llmText({ ...opts, maxAttempts: 2 })).rejects.toThrow()
  expect(metrics[0]).toMatchObject({ error: 'http_429', totalMs: 3, queueMs: 0 })
})
it('rounds timer spans after accumulation', () => {
  let now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const timer = startTimer()
  now = 0.6; timer.mark('db')
  now = 1.2; timer.mark('db')
  expect(timer.spans()).toEqual({ db: 1 })
  expect(timer.totalMs()).toBe(1)
})
it('passes model parameters and per-role token and timeout defaults to the client', async () => {
  vi.stubEnv('LLM_MODEL_PARAMS', '{"chat-model":{"thinking":{"type":"disabled"}}}')
  const chat = vi.fn(async () => 'ok')
  setLlmClient({ chat, embed: async () => [] })
  await llmText(opts)
  expect(chat).toHaveBeenCalledWith(expect.objectContaining({ maxTokens: 500, timeoutMs: 20000,
    extraBody: { thinking: { type: 'disabled' } } }))
})

it.each([
  [{ status: 401 }, 'http_401'], [{ status: 403 }, 'http_403'], [{ status: 429 }, 'http_429'],
  [{ status: 400 }, 'http_4xx'], [{ status: 503 }, 'http_5xx'],
  [{ name: 'APIConnectionTimeoutError' }, 'timeout'], [{ name: 'APIConnectionError' }, 'network'],
  [{ message: 'secret' }, 'unknown'],
])('classifies provider failure %j as %s', async (error, category) => {
  setLlmClient({ chat: async () => { throw error }, embed: async () => [] })
  await expect(llmText({ ...opts, maxAttempts: 1 })).rejects.toThrow()
  expect(metrics[0]?.error).toBe(category)
})
it.each([['', 'empty'], ['not json', 'schema']])('classifies output failure %j', async (content, category) => {
  setLlmClient({ chat: async () => content, embed: async () => [1] })
  await expect(llmJson({ ...opts, maxAttempts: 1, schema: z.object({ name: z.string() }) })).rejects.toThrow()
  expect(metrics[0]?.error).toBe(category)
  await expect(embed('test')).rejects.toThrow()
  expect(metrics[1]?.error).toBe('dimension')
})

it('classifies actual SDK timeout and network errors', async () => {
  const OpenAI = (await import('openai')).default
  for (const [error, category] of [[new OpenAI.APIConnectionTimeoutError(), 'timeout'],
    [new OpenAI.APIConnectionError({}), 'network']] as const) {
    setLlmClient({ chat: async () => { throw error }, embed: async () => [] })
    await expect(llmText({ ...opts, maxAttempts: 1 })).rejects.toThrow()
    expect(metrics.at(-1)?.error).toBe(category)
  }
})
