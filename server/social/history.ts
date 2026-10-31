// B6｜歷史嘗試＋重啟對話（docs/07B 的 B6、02 F8）。擁有者：B。不回傳任何分數。
import type { ReasonType, StartConversationInput } from '../../shared/types.js'
import type { AgentStore, HistoryItem } from './agentStore.js'
import { writeLog } from '../lib/log.js'
import { TaskError } from './task.js'

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

/**
 * 重啟對話的兩種方式（02 F8）：
 * - human：本人去聊（我本人 ↔ 對方的分身），聊天室裡可以再按「請求真人」
 * - request_human：直接請求對方本人上線（先開一場由我本人發起的對話，再通知對方，格式同 C7）
 * 不提供「讓分身再試一次」：雙方檔案沒變，分身重聊多半是同樣結果。
 */
export type ReopenMode = 'human' | 'request_human'

export interface ReopenDeps {
  store: AgentStore
  startConversation: (input: StartConversationInput) => Promise<{ conversationId: string }>
}

export async function reopenAttempt(userId: string, attemptId: string, mode: ReopenMode, deps: ReopenDeps) {
  const attempt = await deps.store.getAttempt(attemptId)
  if (!attempt || attempt.user_id !== userId) throw new TaskError('找不到这笔记录', 404)

  const { conversationId } = await deps.startConversation({
    aUserId: userId,
    bUserId: attempt.target_user_id,
    aController: 'human',
    origin: 'manual',
  })
  if (mode === 'request_human') {
    // TODO(C7)：Jerry 若把「請求真人」包成 contract（含種子用戶自動回應），改成呼叫它
    await deps.store.notifyRequestHuman(attempt.target_user_id, { conversationId, fromName: await deps.store.displayName(userId) })
  }
  await deps.store.markReopened(attemptId, new Date())
  await writeLog({
    user_id: userId,
    agent: 'social',
    conversation_id: conversationId,
    action: mode === 'request_human' ? `请求${attempt.target_name}本人上线` : `本人去和${attempt.target_name}聊`,
    reason: '重启历史记录里的对话',
  })
  return { mode, conversationId }
}
