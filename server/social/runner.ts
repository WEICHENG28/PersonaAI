// B3｜社交 Agent 工作循環：目標 → 規劃 → 執行 → 評估 → 決策 → 回報（02 第 4 節、07B 的 B3）。擁有者：B。
// 每呼叫一次 runTaskStep 推進一步；worker（scripts/worker.ts）或 POST /api/tasks/:id/step 會呼叫它。
import type { AgentTask, Evaluation, LobbyCandidate, LobbyQuery, StartConversationInput, TaskReport, TaskStatus } from '../../shared/types'
import { CONFIG } from '../lib/config'
import { writeLog } from '../lib/log'
import type { AgentStore } from './agentStore'
import { attemptResult, decideGuard, isTaskDone, reachedDailyLimit, unsuitableReason, type DecideAction } from './guards'

export interface PickResult {
  target: LobbyCandidate | null
  reason: string
  openingTopic?: string
}

export interface RunnerDeps {
  store: AgentStore
  now: () => Date
  searchLobby: (userId: string, q: LobbyQuery) => Promise<LobbyCandidate[]>
  pick: (task: AgentTask, candidates: LobbyCandidate[]) => Promise<PickResult>
  evaluate: (task: AgentTask, conversationId: string, round: number) => Promise<Evaluation>
  decide: (task: AgentTask, evaluation: Evaluation) => Promise<DecideAction | null>
  buildReport: (task: AgentTask) => Promise<TaskReport>
  deliverReport: (userId: string, report: TaskReport) => Promise<void>
  startConversation: (input: StartConversationInput) => Promise<{ conversationId: string }>
  runTwinRounds: (conversationId: string, rounds: number) => Promise<{ roundCount: number; ended: boolean }>
  endConversation: (conversationId: string, reason: 'unsuitable' | 'done' | 'declined') => Promise<void>
  markWaitingHuman: (conversationId: string) => Promise<void>
}

/** 這一步做了什麼（給 API 與 worker 顯示）。 */
export type StepOutcome =
  | 'not_running'
  | 'finished'
  | 'paused_daily_limit'
  | 'started_chat'
  | 'no_candidate'
  | 'start_failed'
  | 'chat_cleared'
  | 'chatting'
  | 'continue_chat'
  | 'notified'
  | 'ended_chat'

const log = (task: AgentTask, action: string, reason: string, extra: { conversation_id?: string; detail?: Record<string, unknown> } = {}) =>
  writeLog({ user_id: task.user_id, agent: 'social', task_id: task.id, action, reason, ...extra })

export async function runTaskStep(taskId: string, deps: RunnerDeps): Promise<StepOutcome> {
  const task = await deps.store.getTask(taskId)
  if (!task || task.status !== 'running') return 'not_running'

  const guarded = await guardTask(task, deps)
  if (guarded) return guarded

  if (!task.active_conversation_id) return planNext(task, deps)
  return advanceChat(task, task.active_conversation_id, deps)
}

/** 每一步都包起來：失敗就累計，連續失敗 TASK_MAX_FAILS 次暫停任務，不讓 worker 停掉（02 第 4 節異常處理）。 */
export async function runTaskStepSafely(taskId: string, deps: RunnerDeps): Promise<StepOutcome | 'failed' | 'paused_failures'> {
  try {
    const outcome = await runTaskStep(taskId, deps)
    await deps.store.resetFailCount(taskId)
    return outcome
  } catch (err) {
    console.error('[runner]', taskId, err)
    const fails = await deps.store.bumpFailCount(taskId)
    const task = await deps.store.getTask(taskId)
    if (!task) return 'failed'
    if (fails >= CONFIG.TASK_MAX_FAILS) {
      await deps.store.updateTask(taskId, { status: 'paused' })
      await log(task, '任务暂停', `连续失败 ${fails} 次，先暂停，等你确认后再继续`)
      return 'paused_failures'
    }
    await log(task, `这一步失败，稍后重试（第 ${fails} 次）`, describe(err))
    return 'failed'
  }
}

/** 任務守門：完成條件、每日代聊上限。 */
async function guardTask(task: AgentTask, deps: RunnerDeps): Promise<StepOutcome | null> {
  if (!task.active_conversation_id && isTaskDone(task, deps.now())) {
    await finishTask(task, 'done', '已达到完成条件', deps)
    return 'finished'
  }
  if (task.active_conversation_id) return null
  const settings = await deps.store.userSettings(task.user_id)
  const today = await deps.store.countAutoChatsSince(task.user_id, startOfDay(deps.now()))
  if (reachedDailyLimit(today, settings.daily_chat_limit)) {
    await finishTask(task, 'paused', `已达每日代聊上限（${settings.daily_chat_limit} 场）`, deps)
    return 'paused_daily_limit'
  }
  return null
}

/** 規劃：挑下一位、開始代聊。 */
async function planNext(task: AgentTask, deps: RunnerDeps): Promise<StepOutcome> {
  const target = await chooseTarget(task, deps)
  if (!target) {
    await finishTask(task, 'done', '大厅里已经没有合适的新对象', deps)
    return 'no_candidate'
  }

  const attempted = [...task.attempted_user_ids, target.candidate.user_id]
  const conversationId = await startWithRetry(task, target, deps)
  if (!conversationId) {
    await deps.store.updateTask(task.id, { attempted_user_ids: attempted })
    await log(task, `无法和 ${target.candidate.display_name} 开始代聊，换下一位`, '发起对话失败，已重试')
    return 'start_failed'
  }

  await deps.store.updateTask(task.id, {
    active_conversation_id: conversationId,
    attempted_user_ids: attempted,
    progress: { ...task.progress, chats: task.progress.chats + 1 },
  })
  await log(task, `开始代聊：${target.candidate.display_name}`, target.reason, {
    conversation_id: conversationId,
    detail: { opening_topic: target.openingTopic ?? null },
  })
  return 'started_chat'
}

async function chooseTarget(task: AgentTask, deps: RunnerDeps): Promise<{ candidate: LobbyCandidate; reason: string; openingTopic?: string } | null> {
  if (task.kind === 'single' && task.target_user_id) {
    if (task.attempted_user_ids.includes(task.target_user_id)) return null
    const name = await deps.store.displayName(task.target_user_id)
    const candidate: LobbyCandidate = {
      user_id: task.target_user_id,
      display_name: name,
      shareable: { intro: '', interests: [], chat_style: '', looking_for: '' },
      similarity: 0,
    }
    return { candidate, reason: '你在大厅指定了这位' }
  }

  const candidates = await deps.searchLobby(task.user_id, {
    purpose: task.purpose,
    conditions: task.conditions,
    excludeIds: task.attempted_user_ids,
  })
  await deps.store.updateTask(task.id, { progress: { ...task.progress, screened: task.progress.screened + candidates.length } })
  task.progress = { ...task.progress, screened: task.progress.screened + candidates.length }
  if (candidates.length === 0) return null

  const picked = await deps.pick(task, candidates)
  if (!picked.target) return null
  return { candidate: picked.target, reason: picked.reason, openingTopic: picked.openingTopic }
}

async function startWithRetry(task: AgentTask, target: { candidate: LobbyCandidate; openingTopic?: string }, deps: RunnerDeps): Promise<string | null> {
  for (let attempt = 0; attempt <= CONFIG.TOOL_MAX_RETRIES; attempt++) {
    try {
      const { conversationId } = await deps.startConversation({
        aUserId: task.user_id,
        bUserId: target.candidate.user_id,
        aController: 'twin',
        origin: 'auto',
        taskId: task.id,
        openingTopic: target.openingTopic,
      })
      return conversationId
    } catch (err) {
      console.error('[runner] startConversation', err)
    }
  }
  return null
}

/** 執行＋評估＋決策：讓分身再聊幾輪，夠多輪後判定，再決定下一步。 */
async function advanceChat(task: AgentTask, conversationId: string, deps: RunnerDeps): Promise<StepOutcome> {
  const state = await deps.store.conversationState(conversationId)
  if (!state || state.status === 'ended' || state.sideAController === 'human') {
    await deps.store.updateTask(task.id, { active_conversation_id: null })
    await log(task, '这场代聊已结束或你已接手，换下一位', state?.sideAController === 'human' ? '本人接手' : '对话已结束', {
      conversation_id: conversationId,
    })
    return 'chat_cleared'
  }

  const { roundCount } = await deps.runTwinRounds(conversationId, CONFIG.ROUNDS_PER_STEP)
  if (roundCount < CONFIG.MIN_ROUNDS_BEFORE_JUDGE) {
    await log(task, `代聊进行中（第 ${roundCount} 轮）`, `至少聊 ${CONFIG.MIN_ROUNDS_BEFORE_JUDGE} 轮才判断`, { conversation_id: conversationId })
    return 'chatting'
  }

  const evaluation = await deps.evaluate(task, conversationId, roundCount)
  return decideNext(task, conversationId, evaluation, deps)
}

async function decideNext(task: AgentTask, conversationId: string, ev: Evaluation, deps: RunnerDeps): Promise<StepOutcome> {
  const settings = await deps.store.userSettings(task.user_id)
  const suggested = await deps.decide(task, ev)
  const decision = decideGuard(suggested, { tier: settings.match_tier, mine: ev.a.verdict, theirs: ev.b.verdict, round: ev.round })
  if (decision.overridden) await log(task, '决策由程序规则修正', decision.overridden, { conversation_id: conversationId })

  if (decision.action === 'continue_chat') {
    await log(task, '继续代聊', '还不确定合不合适，多聊几轮再判断', { conversation_id: conversationId })
    return 'continue_chat'
  }

  // 我方一定是發起方（side_a），對方就是這場代聊開始時加進 attempted 的最後一位
  const targetId = task.target_user_id ?? task.attempted_user_ids.at(-1) ?? ''
  const result = attemptResult(ev.a.verdict, ev.b.verdict)
  const base = { user_id: task.user_id, target_user_id: targetId, conversation_id: conversationId, task_id: task.id, origin: 'auto' as const, outline: ev.a.outline }

  if (decision.action === 'notify_user') {
    await deps.store.recordAttempt({ ...base, result, reason_type: null, reason_text: null })
    await deps.markWaitingHuman(conversationId)
    await deps.store.notifyMatch(task.user_id, { conversation_id: conversationId, task_id: task.id, mutual: result === 'mutual' })
    await deps.store.updateTask(task.id, { active_conversation_id: null, progress: { ...task.progress, suitable: task.progress.suitable + 1 } })
    await log(task, result === 'mutual' ? '双向合适，通知你' : '对你来说合适，通知你', `第 ${ev.round} 轮判定`, { conversation_id: conversationId })
    return 'notified'
  }

  const reasonType = decision.reason?.type ?? unsuitableReason(ev.a.verdict, ev.b.verdict, ev.a.reason_type)
  const reasonText = decision.reason?.text ?? ev.a.reason_text ?? '聊下来不太合拍'
  await deps.store.recordAttempt({ ...base, result: 'unsuitable', reason_type: reasonType, reason_text: reasonText })
  await deps.endConversation(conversationId, 'unsuitable')
  await deps.store.updateTask(task.id, { active_conversation_id: null })
  await log(task, '不合适，结束这场代聊，记入历史', reasonText, { conversation_id: conversationId })
  return 'ended_chat'
}

async function finishTask(task: AgentTask, status: Extract<TaskStatus, 'done' | 'paused'>, reason: string, deps: RunnerDeps): Promise<void> {
  const updated = await deps.store.updateTask(task.id, { status })
  const report = await deps.buildReport(updated)
  await deps.deliverReport(task.user_id, report)
  await log(task, status === 'done' ? '任务完成，交给 AI 朋友回报' : '任务暂停，交给 AI 朋友回报', reason)
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
