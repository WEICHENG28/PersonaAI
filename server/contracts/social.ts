// B 提供的跨線函式（docs/07 第 6 節）。
// llmText／llmJson／embed 在 server/lib/llm、writeLog 在 server/lib/log。
import type { AgentTask } from '../../shared/types.js'
import { getAgentStore } from '../social/agentStore.js'
import { createSingleTargetTask as createSingle } from '../social/task.js'

/** B1：解析一句話任務，建立 pending_confirm 任務。 */
export { createTaskFromText } from '../social/task.js'

/** B2：搜尋大廳，回傳排序後的候選人。 */
export { searchLobby } from '../social/lobby.js'

/** B6：大廳選「分身去聊」時用，建立 running 的單人任務。 */
export async function createSingleTargetTask(userId: string, targetUserId: string): Promise<AgentTask> {
  return createSingle(userId, targetUserId, await getAgentStore().displayName(targetUserId))
}
