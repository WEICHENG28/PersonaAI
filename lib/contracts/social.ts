import type { AgentTask, LobbyCandidate, LobbyQuery } from '@/lib/types'
import { agentTask as taskFixture, lobbyCandidates as candidatesFixture } from '@/fixtures/social'

/**
 * B 線跨線函式 stub（07 §6）。簽名正確、回傳 fixtures 假資料；
 * B1/B2 完成時換成真實作，簽名不變。
 */

/** 解析一句話任務，建立 `pending_confirm` 任務。（A、C 使用） */
export async function createTaskFromText(userId: string, text: string): Promise<AgentTask> {
  void userId
  void text
  return taskFixture
}

/** 大廳選「分身去聊」時用，建立 `running` 的單人任務。（C 使用） */
export async function createSingleTargetTask(userId: string, targetUserId: string): Promise<AgentTask> {
  void userId
  void targetUserId
  return taskFixture
}

/** 搜尋可代聊的用戶。（C 的大廳助手使用） */
export async function searchLobby(userId: string, q: LobbyQuery): Promise<LobbyCandidate[]> {
  void userId
  void q
  return candidatesFixture
}
