// 部署檢查：GET /api/health/deep 回報環境變數有沒有設定、資料庫與 AI 模型連不連得上。
// 只回「有／沒有」與錯誤種類，不回任何值或金鑰。擁有者：B（S0）。
import { createClient } from '@supabase/supabase-js'

const REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'LLM_BASE_URL',
  'LLM_API_KEY',
  'MODEL_CHAT',
  'MODEL_REASON',
  'MODEL_FAST',
  'MODEL_EMBED',
  'EMBEDDING_DIM',
] as const

export interface DeepHealth {
  env: Record<(typeof REQUIRED)[number], boolean>
  /** 值的前後有引號或空白，或模型参数不是有效对象（不返回实际值） */
  suspicious: string[]
  database?: 'ok' | 'missing_env' | string
  llm?: 'ok' | 'missing_env' | string
}

let cached: { expires: number; value: Promise<Pick<DeepHealth, 'database' | 'llm'>> } | null = null

export async function deepHealth({ full }: { full: boolean }): Promise<DeepHealth> {
  const env = Object.fromEntries(REQUIRED.map((k) => [k, Boolean(process.env[k])])) as DeepHealth['env']
  const suspicious: string[] = REQUIRED.filter((k) => {
    const v = process.env[k]
    return v !== undefined && (v !== v.trim() || /^["']|["']$/.test(v))
  })
  const params = process.env.LLM_MODEL_PARAMS
  if (params) {
    try {
      const parsed: unknown = JSON.parse(params)
      const object = (value: unknown): value is Record<string, unknown> =>
        value !== null && typeof value === 'object' && !Array.isArray(value)
      if (!object(parsed) || !Object.values(parsed).every(object)) suspicious.push('LLM_MODEL_PARAMS')
    } catch { suspicious.push('LLM_MODEL_PARAMS') }
  }
  if (!full) return { env, suspicious }
  if (!cached || Date.now() >= cached.expires) {
    cached = { expires: Date.now() + 60000,
      value: Promise.all([checkDatabase(), checkLlm()]).then(([database, llm]) => ({ database, llm })) }
  }
  return { env, suspicious, ...await cached.value }
}

async function checkDatabase(): Promise<string> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return 'missing_env'
  try {
    const db = createClient(url, key, { auth: { persistSession: false } })
    const { error } = await db.from('users').select('id', { count: 'exact', head: true })
    return error ? 'error: database' : 'ok'
  } catch {
    return 'error: connection'
  }
}

/** 只呼叫 /models 清單，不產生任何對話，不花 token。 */
async function checkLlm(): Promise<string> {
  const base = process.env.LLM_BASE_URL
  const key = process.env.LLM_API_KEY
  if (!base || !key) return 'missing_env'
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000) })
    return res.ok ? 'ok' : `error: HTTP ${res.status}`
  } catch {
    return 'error: connection'
  }
}
