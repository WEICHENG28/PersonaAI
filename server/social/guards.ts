// 社交 Agent 的程式規則（docs/07B 的 B3、B4、B5）：純函式，方便測試；LLM 的決定要經過這裡把關。擁有者：B。
import type { AgentTask, AttemptResult, MatchTier, ReasonType, VerdictValue } from '../../shared/types'
import { CONFIG } from '../lib/config'

/** 完成條件：合適人數、代聊場數、期限任一達到就算完成。 */
export function isTaskDone(task: AgentTask, now: Date): boolean {
  const d = task.done_condition
  const p = task.progress
  if (d.suitable_count && p.suitable >= d.suitable_count) return true
  if (d.max_chats && p.chats >= d.max_chats) return true
  if (d.deadline && now.getTime() > new Date(d.deadline).getTime()) return true
  return false
}

export function reachedDailyLimit(count: number, limit: number): boolean {
  return count >= limit
}

/** 依用戶選的檔位決定要不要通知本人（02 第 6.1 節）。 */
export function isNotifiable(tier: MatchTier, mine: VerdictValue, theirs: VerdictValue): boolean {
  return tier === 'one_way' ? mine === 'suitable' : mine === 'suitable' && theirs === 'suitable'
}

export function attemptResult(mine: VerdictValue, theirs: VerdictValue): Exclude<AttemptResult, 'ongoing'> {
  if (mine === 'suitable' && theirs === 'suitable') return 'mutual'
  if (mine === 'suitable') return 'one_way'
  return 'unsuitable'
}

export function unsuitableReason(mine: VerdictValue, theirs: VerdictValue, myReason: ReasonType | null): ReasonType {
  if (mine === 'suitable' && theirs !== 'suitable') return 'not_mutual'
  return myReason ?? 'friction'
}

export type DecideAction = 'continue_chat' | 'notify_user' | 'end_conversation'

export interface DecideContext {
  tier: MatchTier
  mine: VerdictValue
  theirs: VerdictValue
  round: number
}

export interface GuardedDecision {
  action: DecideAction
  /** 程式規則推翻了 LLM 的決定時，寫進日誌的說明。 */
  overridden: string | null
  /** 結束時給用戶看的抽象原因（只有「聊得不夠深」由程式決定）。 */
  reason: { type: ReasonType; text: string } | null
}

/** 程式規則優先（07B 的 B4 表格）；和 LLM 建議不一致時以程式為準並註明。 */
export function decideGuard(suggested: DecideAction | null, ctx: DecideContext): GuardedDecision {
  const uncertain = ctx.mine === 'uncertain' || ctx.theirs === 'uncertain'
  let action: DecideAction
  let reason: GuardedDecision['reason'] = null
  if (uncertain && ctx.round < CONFIG.MAX_ROUNDS) action = 'continue_chat'
  else if (uncertain) {
    action = 'end_conversation'
    reason = { type: 'friction', text: '聊得不够深，无法判断' }
  } else if (isNotifiable(ctx.tier, ctx.mine, ctx.theirs)) action = 'notify_user'
  else action = 'end_conversation'

  const overridden = suggested && suggested !== action ? `规划器建议 ${suggested}，按程序规则改为 ${action}` : null
  return { action, overridden, reason }
}
