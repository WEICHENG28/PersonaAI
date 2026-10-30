// B 提供的跨線函式（docs/07 第 6 節）。還沒實作的仍是 stub（回傳 server/fixtures 假資料）。
// llmText／llmJson／embed 在 server/lib/llm、writeLog 在 server/lib/log。
import type { AgentTask } from '../../shared/types'
import { fakeTask } from '../fixtures/social'

/** B1 已實作：解析一句話任務，建立 pending_confirm 任務。 */
export { createTaskFromText } from '../social/task'

/** B2 已實作：搜尋大廳，回傳排序後的候選人。 */
export { searchLobby } from '../social/lobby'

export async function createSingleTargetTask(userId: string, targetUserId: string): Promise<AgentTask> {
  return fakeTask(userId, { kind: 'single', target_user_id: targetUserId, status: 'running' })
}
