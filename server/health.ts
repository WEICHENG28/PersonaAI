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
  /** 值的前後有引號或空白（常見的貼上錯誤） */
  suspicious: string[]
  database: 'ok' | 'missing_env' | string
  llm: 'ok' | 'missing_env' | string
}

export async function deepHealth(): Promise<DeepHealth> {
  const env = Object.fromEntries(REQUIRED.map((k) => [k, Boolean(process.env[k])])) as DeepHealth['env']
  const suspicious = REQUIRED.filter((k) => {
    const v = process.env[k]
    return v !== undefined && (v !== v.trim() || /^["']|["']$/.test(v))
  })
  return { env, suspicious, database: await checkDatabase(), llm: await checkLlm() }
}

async function checkDatabase(): Promise<string> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return 'missing_env'
  try {
    const db = createClient(url, key, { auth: { persistSession: false } })
    const { error } = await db.from('users').select('id', { count: 'exact', head: true })
    return error ? `error: ${error.message.slice(0, 80)}` : 'ok'
  } catch (err) {
    return `error: ${String(err).slice(0, 80)}`
  }
}

/** 只呼叫 /models 清單，不產生任何對話，不花 token。 */
async function checkLlm(): Promise<string> {
  const base = process.env.LLM_BASE_URL
  const key = process.env.LLM_API_KEY
  if (!base || !key) return 'missing_env'
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/models`, { headers: { Authorization: `Bearer ${key}` } })
    return res.ok ? 'ok' : `error: HTTP ${res.status}`
  } catch (err) {
    return `error: ${String(err).slice(0, 80)}`
  }
}
