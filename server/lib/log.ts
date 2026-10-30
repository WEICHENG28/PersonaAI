// Agent 工作日誌（docs/07 第 6 節）：每個 Agent 動作都要寫，並附一句理由。
// 寫入失敗只在 console 記錯誤，不中斷主流程。
import { createClient } from '@supabase/supabase-js'
import type { AgentLogInput } from '../../shared/types'

export type LogWriter = (entry: AgentLogInput) => Promise<void>

let override: LogWriter | null = null
let defaultWriter: LogWriter | null = null

/** 測試用：傳 null 還原成預設寫入方式。 */
export function setLogWriter(writer: LogWriter | null): void {
  override = writer
}

export async function writeLog(entry: AgentLogInput): Promise<void> {
  try {
    await (override ?? getDefaultWriter())(entry)
  } catch (err) {
    console.error('[writeLog] 寫入 agent_logs 失敗', entry.agent, entry.action, err)
  }
}

function getDefaultWriter(): LogWriter {
  defaultWriter ??= createDefaultWriter()
  return defaultWriter
}

function createDefaultWriter(): LogWriter {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  // 還沒設定 Supabase（例如只跑 mock）時先印在 console
  if (!url || !key) {
    return async (entry) => console.log(`[agent_log] ${entry.agent}｜${entry.action}｜${entry.reason ?? ''}`)
  }
  // TODO(A0b 之後)：改用 server/lib/supabase.ts 的共用 client
  const db = createClient(url, key, { auth: { persistSession: false } })
  return async (entry) => {
    const { error } = await db.from('agent_logs').insert({
      user_id: entry.user_id,
      agent: entry.agent,
      action: entry.action,
      reason: entry.reason ?? null,
      task_id: entry.task_id ?? null,
      conversation_id: entry.conversation_id ?? null,
      detail: entry.detail ?? null,
    })
    if (error) throw error
  }
}
