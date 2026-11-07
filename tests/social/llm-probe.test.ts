import { describe, expect, it, vi } from 'vitest'
import type OpenAI from 'openai'
import { parseProbeArgs, runProbe, main } from '../../scripts/llm-probe.js'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { percentile, redactError, summarizeProbe, type ProbeResult } from '../../scripts/probe/lib.js'

const result = (extra: Partial<ProbeResult> = {}): ProbeResult => ({
  model: 'Qwen3.8-Flash', mode: 'stream', variant: 'qwen_no_think', ok: true,
  ttftMs: 100, totalMs: 200, completionTokens: 12, reasoningChars: 4,
  jsonObject: 'skipped', ...extra,
})

const options = { models: ['Qwen3.8-Flash'], embeds: ['GLM-Embedding-3'], runs: 1, concurrency: 3 }
const response = (content: string) => ({
  id: 'mock', object: 'chat.completion', created: 0, model: 'mock',
  choices: [{ index: 0, message: { role: 'assistant', content, refusal: null }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
})

function mockClient(json = '{"ok":true}') {
  let clock = 0
  const calls: Record<string, unknown>[] = []
  const chat = vi.fn(async (body: Record<string, unknown>) => {
    calls.push(body)
    if (body.stream) {
      return (async function* () {
        clock += 10
        yield { choices: [{ delta: { role: 'assistant', reasoning_content: '思考' } }] }
        clock += 20
        yield { choices: [{ delta: { content: '你好' } }] }
        clock += 10
        yield { choices: [{ delta: {}, finish_reason: 'stop' }] }
        yield { choices: [], usage: { prompt_tokens: 5, completion_tokens: 9, total_tokens: 14 } }
      })()
    }
    clock += 10
    return response(body.response_format ? json : '你好')
  })
  const embed = vi.fn(async () => ({
    object: 'list', model: 'GLM-Embedding-3', usage: { prompt_tokens: 1, total_tokens: 1 },
    data: [{ object: 'embedding', index: 0, embedding: Array(768).fill(0.1) }],
  }))
  const client = { chat: { completions: { create: chat } }, embeddings: { create: embed } } as unknown as OpenAI
  return { client, chat, embed, calls, now: () => clock }
}

describe('probe CLI and mocked platform', () => {
  it('validates arguments before any platform access', () => {
    expect(parseProbeArgs(['--models', 'a,b', '--embed', 'e,f', '--runs', '3', '--concurrency', '2']))
      .toEqual({ models: ['a', 'b'], embeds: ['e', 'f'], runs: 3, concurrency: 2 })
    for (const args of [[], ['--models', 'a', '--runs', '0'], ['--embed', 'e', '--concurrency', 'NaN'],
      ['--models', 'a', '--runs', '1.5'], ['--models', 'a', '--unknown']]) {
      expect(() => parseProbeArgs(args)).toThrow()
    }
  })

  it('help does not load settings, create a client or write a report', async () => {
    const loadEnv = vi.fn(() => { throw new Error('must not read settings') })
    const createClient = vi.fn(() => { throw new Error('must not create a client') })
    const print = vi.fn()
    await main(['--help'], { loadEnv, createClient, print })
    expect(loadEnv).not.toHaveBeenCalled()
    expect(createClient).not.toHaveBeenCalled()
    expect(print.mock.calls.flat().join(' ')).toContain('--concurrency')
  })

  it('measures all variants, separates JSON checks, and records actual embedding dimensions', async () => {
    const fake = mockClient()
    const rows = await runProbe({ ...options, concurrency: 1 }, fake.client, [], fake.now)
    expect(rows).toHaveLength(10)
    expect(rows.filter(r => r.mode === 'stream')).toEqual(expect.arrayContaining([
      expect.objectContaining({ variant: 'qwen_no_think', ttftMs: 30, totalMs: 40,
        reasoningChars: 2, completionTokens: 9, jsonObject: 'skipped', ok: true }),
    ]))
    expect(rows.filter(r => r.jsonObject === 'ok')).toHaveLength(3)
    expect(rows.find(r => r.mode === 'embed')).toMatchObject({ embedDim: 768, ok: true })
    expect(fake.embed).toHaveBeenCalledWith(expect.objectContaining({ dimensions: 1024 }), expect.anything())
    expect(fake.calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ enable_thinking: false }),
      expect.objectContaining({ thinking: { type: 'disabled' } }),
      expect.objectContaining({ stream: true, stream_options: { include_usage: true } }),
    ]))
    expect(fake.calls.filter(c => !('enable_thinking' in c) && !('thinking' in c))).toHaveLength(3)
  })

  it.each(['not JSON', '[]', 'null'])('marks non-object JSON output invalid: %s', async text => {
    const fake = mockClient(text)
    const rows = await runProbe(options, fake.client)
    expect(rows.filter(r => r.jsonObject === 'invalid')).toHaveLength(3)
    expect(rows.filter(r => r.jsonObject === 'invalid').every(r => !r.ok)).toBe(true)
  })

  it('records 400 as rejected and redacts provider errors while continuing the batch', async () => {
    const fake = mockClient()
    fake.chat.mockRejectedValue(Object.assign(new Error('401 key=secret123 https://private.invalid/v1'), { status: 400 }))
    const rows = await runProbe(options, fake.client, ['secret123'])
    expect(rows.filter(r => r.jsonObject === 'rejected')).toHaveLength(3)
    expect(rows.filter(r => !r.ok)).toHaveLength(9)
    expect(rows.find(r => r.mode === 'embed')?.ok).toBe(true)
    expect(JSON.stringify(rows)).not.toMatch(/secret123|http|private\.invalid/)
  })

  it('keeps request concurrency bounded and measures runs without retrying failures', async () => {
    const fake = mockClient()
    let active = 0
    let peak = 0
    fake.chat.mockImplementation(async () => {
      active++
      peak = Math.max(peak, active)
      await Promise.resolve()
      active--
      throw new Error('rate limited')
    })
    const rows = await runProbe({ ...options, embeds: [], runs: 2, concurrency: 2 }, fake.client)
    expect(peak).toBe(2)
    expect(fake.chat).toHaveBeenCalledTimes(18)
    expect(rows).toHaveLength(18)
    expect(summarizeProbe(rows)).toContain('错误率：100.0%')
  })

  it('does not label transport failures as invalid JSON responses', async () => {
    const fake = mockClient()
    fake.chat.mockRejectedValue(Object.assign(new Error('server unavailable'), { status: 503 }))
    const rows = await runProbe({ ...options, embeds: [] }, fake.client)
    expect(rows.every(r => !r.ok && r.jsonObject === 'skipped')).toBe(true)
  })

  it('does not mistake reasoning-only streams for a visible reply', async () => {
    const fake = mockClient()
    fake.chat.mockImplementation(async () => (async function* () {
      yield { choices: [{ delta: { reasoning_content: '思考' } }] }
    })())
    const rows = await runProbe({ ...options, embeds: [] }, fake.client)
    expect(rows.filter(r => r.mode === 'stream')).toEqual([
      expect.objectContaining({ ok: false, ttftMs: null, completionTokens: null, reasoningChars: 2 }),
      expect.objectContaining({ ok: false, ttftMs: null, completionTokens: null, reasoningChars: 2 }),
      expect.objectContaining({ ok: false, ttftMs: null, completionTokens: null, reasoningChars: 2 }),
    ])
  })

  it('records midstream failures and malformed embeddings without aborting other jobs', async () => {
    const fake = mockClient()
    fake.chat.mockImplementation(async () => (async function* () {
      yield { choices: [{ delta: { content: '你好' } }] }
      throw new Error('stream interrupted secret123')
    })())
    fake.embed.mockResolvedValue({ data: [] } as never)
    const rows = await runProbe(options, fake.client, ['secret123'])
    expect(rows.filter(r => r.mode === 'stream').every(r => !r.ok && r.ttftMs !== null)).toBe(true)
    expect(rows.find(r => r.mode === 'embed')).toMatchObject({ ok: false })
    expect(JSON.stringify(rows)).not.toContain('secret123')
  })

  it('marks streams aborted after visible text as failed even if the iterator ends normally', async () => {
    const fake = mockClient()
    const controller = new AbortController()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
    fake.chat.mockImplementation(async () => (async function* () {
      yield { choices: [{ delta: { content: '你好' }, finish_reason: null }] }
      controller.abort(new Error('probe deadline'))
    })())
    try {
      const rows = await runProbe({ ...options, embeds: [] }, fake.client)
      expect(rows.filter(r => r.mode === 'stream').every(r => !r.ok && r.ttftMs !== null)).toBe(true)
    } finally {
      timeout.mockRestore()
    }
  })

  it('rejects a clean EOF without a terminal completion chunk', async () => {
    const fake = mockClient()
    fake.chat.mockImplementation(async () => (async function* () {
      yield { choices: [{ delta: { content: '你好' }, finish_reason: null }] }
    })())
    const rows = await runProbe({ ...options, embeds: [] }, fake.client)
    expect(rows.filter(r => r.mode === 'stream').every(r => !r.ok)).toBe(true)
  })

  it('writes a scrubbed report with SDK retries disabled', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'persona-probe-'))
    try {
      const fake = mockClient()
      fake.chat.mockRejectedValue(new Error('key=secret123 https://private.invalid/v1'))
      const createClient = vi.fn(() => fake.client)
      const print = vi.fn()
      await main(['--models', 'secret123', '--runs', '1'], {
        cwd, loadEnv: vi.fn(), env: { LLM_BASE_URL: 'https://private.invalid/v1', LLM_API_KEY: 'secret123' },
        createClient, print,
      })
      expect(createClient).toHaveBeenCalledWith(expect.objectContaining({
        maxRetries: 0, timeout: 30000, logLevel: 'off',
      }))
      const names = await readdir(join(cwd, '.local/eval'))
      expect(names).toHaveLength(1)
      expect(names[0]).toMatch(/^probe-\d{8}-\d{4}\.md$/)
      const report = await readFile(join(cwd, '.local/eval', names[0]!), 'utf-8')
      expect(report).not.toMatch(/secret123|http|private\.invalid/)
      expect(print.mock.calls.flat().join(' ')).not.toMatch(/secret123|http|private\.invalid/)
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })
})

describe('probe statistics and report safety', () => {
  it('interpolates percentiles without changing the input', () => {
    const xs = [4, 1, 3, 2]
    expect(percentile(xs, 50)).toBe(2.5)
    expect(percentile(xs, 0)).toBe(1)
    expect(percentile(xs, 100)).toBe(4)
    expect(percentile([], 50)).toBeNull()
    expect(xs).toEqual([4, 1, 3, 2])
  })

  it('redacts literal, encoded and URL secrets without interpreting regex characters', () => {
    const msg = '401 key=sk-abc token=a+b? url=https://private.invalid/v1?q=abc encoded=a%2Bb%3F'
    const safe = redactError(msg, ['sk-abc', 'a+b?', ''])
    expect(safe).not.toContain('sk-abc')
    expect(safe).not.toContain('a+b?')
    expect(safe).not.toContain('a%2Bb%3F')
    expect(safe).not.toContain('http')
    expect(safe).not.toContain('private.invalid')
  })

  it('groups model/mode/variant and excludes failures from latency percentiles', () => {
    const report = summarizeProbe([
      result(), result({ ttftMs: 300, totalMs: 600, reasoningChars: 8 }),
      result({ ok: false, ttftMs: null, totalMs: 9000, error: 'https://private.invalid' }),
      result({ mode: 'nonstream', variant: 'default', ttftMs: null, jsonObject: 'rejected' }),
      result({ model: 'GLM-Embedding-3', mode: 'embed', variant: 'default',
        ttftMs: null, completionTokens: null, reasoningChars: 0, embedDim: 1024 }),
    ])
    expect(report).toContain('| Qwen3.8-Flash | stream | qwen_no_think | 200 | 400 | 2/3 (66.7%) |')
    expect(report).toContain('rejected:1')
    expect(report).toContain('1024')
    expect(report).not.toContain('http')
  })

  it('keeps text success, reasoning and usage independent from JSON capability failures', () => {
    const report = summarizeProbe([
      result({ mode: 'nonstream', requestKind: 'text', ttftMs: null, totalMs: 200,
        reasoningChars: 4, completionTokens: 12 }),
      result({ mode: 'nonstream', requestKind: 'json_object', ok: false, jsonObject: 'rejected',
        totalMs: 9999, reasoningChars: 999, completionTokens: 999 }),
      result({ mode: 'nonstream', requestKind: 'json_object', ok: false, jsonObject: 'skipped',
        totalMs: 9999, reasoningChars: 999, completionTokens: 999 }),
    ])
    expect(report).toContain('| Qwen3.8-Flash | nonstream | qwen_no_think | — | 200 | 1/1 (100.0%) |')
    expect(report).toContain('ok:0, rejected:1, invalid:0, skipped:1 | 4 | 12 |')
    expect(report).toContain('错误率：66.7%')
  })
})
