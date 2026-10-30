// B6｜歷史嘗試＋重啟對話（docs/07B 的 B6、02 F8）。擁有者：B。不回傳任何分數。
import type { ReasonType, StartConversationInput } from '../../shared/types'
import type { AgentStore, HistoryItem } from './agentStore'
import { TaskError, createSingleTargetTask } from './task'

const HISTORY_LIMIT = 50
const INSIGHT_MIN = 3
const INSIGHT_WINDOW = 10

/** AI 朋友觀察用的固定說法（抽象特質，不透露對方的具體事件）。 */
const INSIGHT_PHRASE: Record<ReasonType, string> = {
  not_mutual: '你觉得聊得来、但对方的偏好不太一样',
  condition_mismatch: '对方的特点和你在意的条件不太一致',
  friction: '聊天的节奏没对上',
}

export interface HistoryView {
  items: Omit<HistoryItem, 'user_id'>[]
  /** 累積 3 筆以上不合適時，阿澈的一句觀察。 */
  insight: string | null
}

export async function listHistory(userId: string, store: AgentStore): Promise<HistoryView> {
  const rows = await store.listAttempts(userId, HISTORY_LIMIT)
  return { items: rows.map(({ user_id: _u, ...rest }) => rest), insight: buildInsight(rows) }
}

/** 從原因類型統計最近的不合適紀錄（07B：用固定模板）。 */
export function buildInsight(rows: Pick<HistoryItem, 'result' | 'reason_type'>[]): string | null {
  const failed = rows.filter((r) => r.result === 'unsuitable').slice(0, INSIGHT_WINDOW)
  if (failed.length < INSIGHT_MIN) return null
  const counts = new Map<ReasonType, number>()
  for (const r of failed) if (r.reason_type) counts.set(r.reason_type, (counts.get(r.reason_type) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  if (!top) return null
  return `最近 ${failed.length} 次没成的里面，有 ${top[1]} 次是${INSIGHT_PHRASE[top[0]]}。这不是谁的错，只是刚好不同步。`
}

export type ReopenMode = 'twin' | 'human'

export interface ReopenDeps {
  store: AgentStore
  startConversation: (input: StartConversationInput) => Promise<{ conversationId: string }>
}

/** 判定不合適不是最終結論：可以讓分身再試一次（新的單人任務），或本人直接去聊。 */
export async function reopenAttempt(userId: string, attemptId: string, mode: ReopenMode, deps: ReopenDeps) {
  const attempt = await deps.store.getAttempt(attemptId)
  if (!attempt || attempt.user_id !== userId) throw new TaskError('找不到这笔记录', 404)

  let result: { mode: ReopenMode; taskId?: string; conversationId?: string }
  if (mode === 'twin') {
    const task = await createSingleTargetTask(userId, attempt.target_user_id, attempt.target_name)
    result = { mode, taskId: task.id }
  } else {
    const { conversationId } = await deps.startConversation({
      aUserId: userId,
      bUserId: attempt.target_user_id,
      aController: 'human',
      origin: 'manual',
    })
    result = { mode, conversationId }
  }
  await deps.store.markReopened(attemptId, new Date())
  return result
}
