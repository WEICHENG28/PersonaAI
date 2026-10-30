// 任務結果回報（07B 的 B8 會再補完：合適名單、不合適原因、效率統計細節）。擁有者：B。
import type { AgentTask, TaskReport } from '../../shared/types'
import type { AgentStore } from './agentStore'

/** 省下的時間 = 代聊場數 × 人工平均聊天分鐘數，附計算依據（02 第 4 節效率統計）。 */
export async function buildReport(task: AgentTask, store: AgentStore): Promise<TaskReport> {
  const { manual_minutes_per_chat: perChat } = await store.userSettings(task.user_id)
  const chats = task.progress.chats
  return {
    task_id: task.id,
    purpose: task.purpose,
    screened: task.progress.screened,
    chats,
    suitable: [],
    unsuitable_reasons: [],
    saved_minutes: chats * perChat,
    basis: `代聊 ${chats} 场 × 人工平均 ${perChat} 分钟`,
  }
}
