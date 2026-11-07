import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import { app } from '../../server/app'

const dbCheck = vi.hoisted(() => vi.fn(async () => ({ error: null })))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ from: () => ({ select: dbCheck }) })) }))
beforeEach(() => { vi.clearAllMocks() })
const saved = { ...process.env }
afterEach(() => {
  process.env = { ...saved }; vi.unstubAllGlobals(); vi.useRealTimers()
})

describe('GET /api/health/deep', () => {
  it('只回有沒有設定，不回任何值；值有引號會被標出來', async () => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.LLM_BASE_URL
    process.env.LLM_API_KEY = '"secret-value-123"'
    const body = await (await app.request('/api/health/deep')).text()
    const json = JSON.parse(body) as { data: { env: Record<string, boolean>; suspicious: string[]; database: string; llm: string } }
    expect(json.data.env.SUPABASE_URL).toBe(false)
    expect(json.data.env.LLM_API_KEY).toBe(true)
    expect(json.data.suspicious).toContain('LLM_API_KEY')
    expect(json.data).not.toHaveProperty('database')
    expect(json.data).not.toHaveProperty('llm')
    expect(body).not.toContain('secret-value-123')
  })
})

it.each(['{', '[]', 'null', '"secret"', '42', '{"Qwen3.8-Max":null}', '{"Qwen*":[]}'])('flags invalid model params offline: %s', async value => {
  process.env.LLM_MODEL_PARAMS = value
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
  const body = await (await app.request('/api/health/deep')).json()
  expect(body.data.suspicious).toContain('LLM_MODEL_PARAMS')
  expect(fetchMock).not.toHaveBeenCalled(); expect(dbCheck).not.toHaveBeenCalled()
})
it.each(['', '{}', '{"Qwen*":{"thinking":{"type":"disabled"}}}'])('accepts optional model params %s', async value => {
  process.env.LLM_MODEL_PARAMS = value
  const body = await (await app.request('/api/health/deep')).json()
  expect(body.data.suspicious).not.toContain('LLM_MODEL_PARAMS')
})
it('requires admin token and caches full probes for 60 seconds including concurrent callers', async () => {
  vi.useFakeTimers()
  process.env.ADMIN_SECRET = 'test-admin-secret-123'
  process.env.SUPABASE_URL = 'https://db.example.test'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service'
  process.env.LLM_BASE_URL = 'https://llm.example.test/v1'
  process.env.LLM_API_KEY = 'test-key'
  const fetchMock = vi.fn(async () => ({ ok: true })); vi.stubGlobal('fetch', fetchMock)
  const anonymous = await (await app.request('/api/health/deep')).json()
  expect(anonymous.data).not.toHaveProperty('llm')
  expect(anonymous.data).not.toHaveProperty('database')
  const publicResult = await (await app.request('/api/health/deep', { headers: { Authorization: 'Bearer wrong' } })).json()
  expect(publicResult.data).not.toHaveProperty('database')
  expect(fetchMock).not.toHaveBeenCalled(); expect(dbCheck).not.toHaveBeenCalled()
  const request = () => app.request('/api/health/deep', { headers: { Authorization: 'Bearer test-admin-secret-123' } })
  const [a, b] = await Promise.all([request(), request()])
  expect((await a.json()).data).toMatchObject({ database: 'ok', llm: 'ok' })
  expect((await b.json()).data.llm).toBe('ok')
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(dbCheck).toHaveBeenCalledTimes(1)
  await request(); expect(fetchMock).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(60001); await request()
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('never exposes provider or database error text in full health', async () => {
  vi.resetModules()
  const { deepHealth } = await import('../../server/health.js')
  process.env.SUPABASE_URL = 'https://db.example.test'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test'
  process.env.LLM_BASE_URL = 'https://llm.example.test'
  process.env.LLM_API_KEY = 'test'
  dbCheck.mockResolvedValueOnce({ error: { message: 'secret' } } as never)
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('private-key') }))
  const result = await deepHealth({ full: true })
  expect(result).toMatchObject({ database: 'error: database', llm: 'error: connection' })
  expect(JSON.stringify(result)).not.toMatch(/secret|private-key/)
})

it('retains missing env results for authorized full checks', async () => {
  vi.resetModules()
  const { deepHealth } = await import('../../server/health.js')
  delete process.env.SUPABASE_URL; delete process.env.LLM_BASE_URL
  expect(await deepHealth({ full: true })).toMatchObject({ database: 'missing_env', llm: 'missing_env' })
})
