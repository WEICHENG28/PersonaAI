// B 提供的跨線函式（docs/07 第 6 節）。還沒實作的仍是 stub（回傳 server/fixtures 假資料）。
// llmText／llmJson／embed 在 server/lib/llm、writeLog 在 server/lib/log。
import type { AgentTask, LobbyCandidate, LobbyQuery } from '../../shared/types'
import { fakeCandidates, fakeTask } from '../fixtures/social'

/** B1 已實作：解析一句話任務，建立 pending_confirm 任務。 */
export { createTaskFromText } from '../social/task'

export async function createSingleTargetTask(userId: string, targetUserId: string): Promise<AgentTask> {
  return fakeTask(userId, { kind: 'single', target_user_id: targetUserId, status: 'running' })
}

export async function searchLobby(_userId: string, q: LobbyQuery): Promise<LobbyCandidate[]> {
  const excluded = new Set(q.excludeIds ?? [])
  return fakeCandidates.filter((c) => !excluded.has(c.user_id)).slice(0, q.limit ?? 10)
}
