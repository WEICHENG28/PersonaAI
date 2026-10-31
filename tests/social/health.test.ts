import { afterEach, describe, expect, it } from 'vitest'
import { app } from '../../server/app'

const saved = { ...process.env }
afterEach(() => {
  process.env = { ...saved }
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
    expect(json.data.database).toBe('missing_env')
    expect(json.data.llm).toBe('missing_env')
    expect(body).not.toContain('secret-value-123')
  })
})
