// B8｜任務結果回報：交給 A 的 deliverReport，由阿澈用朋友口吻說出來。擁有者：B。不含任何分數。
import type { AgentTask, TaskReport } from '../../shared/types.js'
import type { AgentStore } from './agentStore.js'
import { computeStats } from './stats.js'
import { withPersonTag } from './personKind.js'

/** 從 match_attempts 取這個任務的合適名單與不合適原因（抽象說法，已過隱私守門）。 */
export async function buildReport(task: AgentTask, store: AgentStore): Promise<TaskReport> {
  const { manual_minutes_per_chat: perChat } = await store.userSettings(task.user_id)
  const attempts = (await store.listAttempts(task.user_id, 200)).filter((a) => a.task_id === task.id)
  const stats = computeStats(task.progress, perChat)
  // 名字後面標「真人／示范用户」，阿澈回報時會照著說；真人排前面
  const suitable = (
    await Promise.all(
      attempts
        .filter((a) => a.result === 'mutual' || a.result === 'one_way')
        .map(async (a) => {
          const isSeed = await store.isSeedUser(a.target_user_id)
          return {
            user_id: a.target_user_id,
            display_name: withPersonTag(a.target_name, isSeed),
            mutual: a.result === 'mutual',
            conversation_id: a.conversation_id,
            is_seed: isSeed,
          }
        }),
    )
  ).sort((a, b) => Number(a.is_seed) - Number(b.is_seed))
  return {
    task_id: task.id,
    purpose: task.purpose,
    screened: stats.screened,
    chats: stats.chats,
    suitable,
    unsuitable_reasons: attempts
      .filter((a) => a.result === 'unsuitable' && a.reason_type)
      .map((a) => ({ reason_type: a.reason_type!, reason_text: a.reason_text ?? '' })),
    saved_minutes: stats.saved_minutes,
    basis: stats.basis,
  }
}
