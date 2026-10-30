import type { AgentLogInput } from '@/lib/types'

/**
 * B 線工作日誌 stub（07 §6）。每個 Agent 動作都要寫，並附理由。
 * B0 交付實作（寫入 agent_logs）；簽名已定稿。
 */
export async function writeLog(entry: AgentLogInput): Promise<void> {
  void entry
  throw new Error('writeLog 尚未實作（B0 交付）')
}
