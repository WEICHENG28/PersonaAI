import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { llmText, llmJson, embed, llmTuning, setLlmClient, setLlmMetricSink, type LlmMetric } from '../../server/lib/llm/index.js'
import { z } from 'zod'
const opts = { role: 'chat' as const, system: '测试', messages: [] }
beforeEach(() => {
  for (const [k, v] of Object.entries({ LLM_BASE_URL: 'https://example.test', LLM_API_KEY: 'test', MODEL_CHAT: 'chat', MODEL_REASON: 'reason', MODEL_FAST: 'fast', MODEL_EMBED: 'embed', EMBEDDING_DIM: '4' })) vi.stubEnv(k, v)
})
afterEach(() => {
  setLlmClient(null); setLlmMetricSink(null); vi.unstubAllEnvs()
  llmTuning.maxConcurrent = 3; llmTuning.maxBackground = 1
})
function controlled() {
  const releases: (() => void)[] = []
  const starts: string[] = []
  setLlmClient({ chat: req => new Promise<string>(resolve => {
    starts.push(req.messages[0]!.content); releases.push(() => resolve('ok'))
  }), embed: async () => [] })
  return { starts, releases }
}
it('allows only one background request while foreground uses spare capacity', async () => {
  const { starts, releases } = controlled()
  const jobs = [1, 2, 3].map(n => llmText({ ...opts, system: `bg${n}`, lane: 'bg' }))
  await vi.waitFor(() => expect(starts).toEqual(['bg1']))
  const fg = llmText({ ...opts, system: 'fg' })
  await vi.waitFor(() => expect(starts).toEqual(['bg1', 'fg']))
  releases.shift()!(); releases.shift()!()
  await vi.waitFor(() => expect(starts).toContain('bg2'))
  releases.shift()!()
  await vi.waitFor(() => expect(starts).toContain('bg3'))
  releases.shift()!(); await Promise.all([...jobs, fg])
})
it('gives queued foreground priority and reserves released slots', async () => {
  llmTuning.maxConcurrent = 1
  const { starts, releases } = controlled()
  const first = llmText({ ...opts, system: 'first' })
  await vi.waitFor(() => expect(starts).toEqual(['first']))
  const bg = llmText({ ...opts, system: 'bg', lane: 'bg' })
  const fg = llmText({ ...opts, system: 'fg' })
  releases.shift()!()
  await vi.waitFor(() => expect(starts).toEqual(['first', 'fg']))
  releases.shift()!()
  await vi.waitFor(() => expect(starts).toEqual(['first', 'fg', 'bg']))
  releases.shift()!(); await Promise.all([first, bg, fg])
})
it('reports actual lanes for successes and failures and defaults to fg', async () => {
  const metrics: LlmMetric[] = []; setLlmMetricSink(m => metrics.push(m))
  setLlmClient({ chat: async () => 'ok', embed: async () => [] })
  await llmText({ ...opts, lane: 'bg' }); await llmText(opts)
  await expect(llmJson({ ...opts, lane: 'bg', maxAttempts: 1, schema: z.object({ n: z.number() }) })).rejects.toThrow()
  expect(metrics.map(m => [m.lane, m.ok])).toEqual([['bg', true], ['fg', true], ['bg', false]])
})

it('releases both global and background slots after a rejected request', async () => {
  llmTuning.maxConcurrent = 1
  let reject!: (error: Error) => void
  const chat = vi.fn().mockImplementationOnce(() => new Promise<string>((_, r) => { reject = r }))
    .mockResolvedValue('ok')
  setLlmClient({ chat, embed: async () => [] })
  const failed = expect(llmText({ ...opts, lane: 'bg', maxAttempts: 1 })).rejects.toThrow('failed')
  const next = llmText({ ...opts, lane: 'bg' })
  reject(new Error('failed'))
  await failed; await expect(next).resolves.toBe('ok')
  expect(chat).toHaveBeenCalledTimes(2)
})

it('embeddings use background capacity and emit actual lane, defaulting to fg', async () => {
  const metrics: LlmMetric[] = []; setLlmMetricSink(m => metrics.push(m))
  let release!: () => void
  const starts: string[] = []
  setLlmClient({ chat: async () => 'ok', embed: req => new Promise<number[]>(resolve => {
    starts.push(req.input); release = () => resolve([1, 2, 3, 4])
  }) })
  const a = embed('a', 'bg'); const b = embed('b', 'bg')
  expect(starts).toEqual(['a']); release(); await a
  await vi.waitFor(() => expect(starts).toEqual(['a', 'b']))
  release(); await b
  const c = embed('c'); release(); await c
  expect(metrics.map(m => m.lane)).toEqual(['bg', 'bg', 'fg'])
})
