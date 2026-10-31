// B3｜社交 Agent 工作循環：目標 → 規劃 → 執行 → 評估 → 決策 → 回報（02 第 4 節、07B 的 B3）。擁有者：B。
// 每呼叫一次 runTaskStep 推進一步；worker（scripts/worker.ts）或 POST /api/tasks/:id/step 會呼叫它。
import type { AgentTask, Evaluation, GuardResult, LobbyCandidate, LobbyQuery, ReasonType, StartConversationInput, TaskReport, TaskStatus } from '../../shared/types.js'
import { CONFIG } from '../lib/config.js'
import { writeLog } from '../lib/log.js'
import type { AgentStore } from './agentStore.js'
import { attemptResult, decideGuard, isTaskDone, reachedDailyLimit, unsuitableReason, type DecideAction } from './guards.js'

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
  /** 規劃器的建議（B4）；回 null 代表只用程式規則。 */
  decide: (task: AgentTask, evaluation: Evaluation) => Promise<{ action: DecideAction; reason: string } | null>
  buildReport: (task: AgentTask) => Promise<TaskReport>
  deliverReport: (userId: string, report: TaskReport) => Promise<void>
  startConversation: (input: StartConversationInput) => Promise<{ conversationId: string }>
  runTwinRounds: (conversationId: string, rounds: number) => Promise<{ roundCount: number; ended: boolean }>
  endConversation: (conversationId: string, reason: 'unsuitable' | 'done' | 'declined') => Promise<void>
  markWaitingHuman: (conversationId: string) => Promise<void>
  /** C 的隱私守門：不合適原因寫進歷史前先過一次。 */
  guardText: (text: string, ownerUserId: string) => Promise<GuardResult>
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
  | 'chat_failed'
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
    await log(task, `跳过 ${target.candidate.display_name}：发起对话失败`, `已重试 ${CONFIG.TOOL_MAX_RETRIES} 次，换下一位`)
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
  // 篩過的人數 = 已經聊過的人 ＋ 這次搜尋到的人（搜尋會排除聊過的，所以不會重複計算同一批人）
  const screened = Math.max(task.progress.screened, task.attempted_user_ids.length + candidates.length)
  task.progress = { ...task.progress, screened }
  await deps.store.updateTask(task.id, { progress: task.progress })
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
  // 任一方本人接手就放手：runTwinRounds 會跳過本人那方，我方分身會連發不等對方回話
  const meHuman = state?.sideAController === 'human'
  const otherHuman = state?.sideBController === 'human'
  if (!state || state.status === 'ended' || meHuman || otherHuman) {
    await deps.store.updateTask(task.id, { active_conversation_id: null })
    const [title, detail] = meHuman
      ? ['你已接手这场对话，换下一位', '你本人接手']
      : otherHuman
        ? ['对方本人已接手这场对话，换下一位', '对方本人接手']
        : ['这场代聊已结束，换下一位', '对话已结束']
    await log(task, title, detail, { conversation_id: conversationId })
    return 'chat_cleared'
  }

  const rounds = await runRoundsWithRetry(conversationId, deps)
  if (!rounds) return skipFailedChat(task, conversationId, deps)
  const { roundCount } = rounds
  if (roundCount < CONFIG.MIN_ROUNDS_BEFORE_JUDGE) {
    await log(task, `代聊进行中（第 ${roundCount} 轮）`, `至少聊 ${CONFIG.MIN_ROUNDS_BEFORE_JUDGE} 轮才判断`, { conversation_id: conversationId })
    return 'chatting'
  }

  const evaluation = await deps.evaluate(task, conversationId, roundCount)
  return decideNext(task, conversationId, evaluation, deps)
}

/** C 的代聊函式失敗時重試 TOOL_MAX_RETRIES 次（07B 的 B9）；仍失敗回 null。 */
async function runRoundsWithRetry(conversationId: string, deps: RunnerDeps): Promise<{ roundCount: number; ended: boolean } | null> {
  for (let attempt = 0; attempt <= CONFIG.TOOL_MAX_RETRIES; attempt++) {
    try {
      return await deps.runTwinRounds(conversationId, CONFIG.ROUNDS_PER_STEP)
    } catch (err) {
      console.error('[runner] runTwinRounds', err)
    }
  }
  return null
}

/** 代聊一直失敗：盡量禮貌收尾，放掉這位、換下一位；這是技術問題，不記成「不合適」。 */
async function skipFailedChat(task: AgentTask, conversationId: string, deps: RunnerDeps): Promise<StepOutcome> {
  const targetId = task.target_user_id ?? task.attempted_user_ids.at(-1) ?? ''
  await deps.endConversation(conversationId, 'done').catch((err: unknown) => console.error('[runner] endConversation', err))
  await deps.store.updateTask(task.id, { active_conversation_id: null })
  const name = await deps.store.displayName(targetId)
  await log(task, `跳过 ${name}：代聊失败`, `已重试 ${CONFIG.TOOL_MAX_RETRIES} 次，换下一位`, { conversation_id: conversationId })
  return 'chat_failed'
}

async function decideNext(task: AgentTask, conversationId: string, ev: Evaluation, deps: RunnerDeps): Promise<StepOutcome> {
  const settings = await deps.store.userSettings(task.user_id)
  const suggested = await deps.decide(task, ev)
  const decision = decideGuard(suggested?.action ?? null, { tier: settings.match_tier, mine: ev.a.verdict, theirs: ev.b.verdict, round: ev.round })
  if (decision.overridden) await log(task, '决策由程序规则修正', decision.overridden, { conversation_id: conversationId })
  // 規劃器和程式規則一致時，日誌用規劃器寫的理由
  const plannerReason = suggested && !decision.overridden ? suggested.reason : null

  if (decision.action === 'continue_chat') {
    const uncertain = ev.a.verdict === 'uncertain' || ev.b.verdict === 'uncertain'
    await log(task, uncertain ? '判定不一致，多聊几轮' : '继续代聊', plannerReason ?? '还不确定合不合适，多聊几轮再判断', { conversation_id: conversationId })
    return 'continue_chat'
  }

  // 我方一定是發起方（side_a），對方就是這場代聊開始時加進 attempted 的最後一位
  const targetId = task.target_user_id ?? task.attempted_user_ids.at(-1) ?? ''
  const result = attemptResult(ev.a.verdict, ev.b.verdict)

  if (decision.action === 'notify_user') {
    await recordAttempts(task, conversationId, targetId, ev, { ended: false, forced: null }, deps)
    await deps.markWaitingHuman(conversationId)
    // 通知格式照 07B 的 B8，由 C 的通知元件顯示「找到合适的人：{名字}」
    await deps.store.notifyMatch(task.user_id, {
      conversationId,
      targetName: await deps.store.displayName(targetId),
      mutual: result === 'mutual',
      taskId: task.id,
    })
    await deps.store.updateTask(task.id, { active_conversation_id: null, progress: { ...task.progress, suitable: task.progress.suitable + 1 } })
    await log(task, result === 'mutual' ? '双向合适，通知你' : '对你来说合适，通知你', plannerReason ?? `第 ${ev.round} 轮判定`, { conversation_id: conversationId })
    return 'notified'
  }

  const reasonText = await recordAttempts(task, conversationId, targetId, ev, { ended: true, forced: decision.reason }, deps)
  await deps.endConversation(conversationId, 'unsuitable')
  await deps.store.updateTask(task.id, { active_conversation_id: null })
  await log(task, '不合适，结束这场代聊，记入历史', reasonText ?? '聊下来不太合拍', { conversation_id: conversationId })
  return 'ended_chat'
}

/**
 * 寫歷史嘗試（07B 的 B6）：我方一筆；對方不是種子用戶時也幫對方寫一筆（用對方視角的判定與大綱）。
 * 不合適原因先過 C 的隱私守門（守的是被描述的那一方）。回傳我方的不合適原因（合適時為 null）。
 */
async function recordAttempts(
  task: AgentTask,
  conversationId: string,
  targetId: string,
  ev: Evaluation,
  how: { ended: boolean; forced: { type: ReasonType; text: string } | null },
  deps: RunnerDeps,
): Promise<string | null> {
  const sides = [
    { owner: task.user_id, other: targetId, mine: ev.a, theirs: ev.b },
    ...((await deps.store.isSeedUser(targetId)) ? [] : [{ owner: targetId, other: task.user_id, mine: ev.b, theirs: ev.a }]),
  ]
  let myReason: string | null = null
  for (const side of sides) {
    // 代聊結束時兩邊都記為不合適（只有一方覺得合適就是「匹配不雙向」）；通知本人時各記自己視角的結果
    const result = how.ended ? 'unsuitable' : attemptResult(side.mine.verdict, side.theirs.verdict)
    let reasonType: ReasonType | null = null
    let reasonText: string | null = null
    if (result === 'unsuitable') {
      reasonType = how.forced?.type ?? unsuitableReason(side.mine.verdict, side.theirs.verdict, side.mine.reason_type)
      reasonText = (await deps.guardText(how.forced?.text ?? side.mine.reason_text ?? '聊下来不太合拍', side.other)).text
    }
    await deps.store.recordAttempt({
      user_id: side.owner,
      target_user_id: side.other,
      conversation_id: conversationId,
      task_id: task.id,
      origin: 'auto',
      result,
      reason_type: reasonType,
      reason_text: reasonText,
      outline: side.mine.outline,
    })
    if (side.owner === task.user_id) myReason = reasonText
  }
  return myReason
}

async function finishTask(task: AgentTask, status: Extract<TaskStatus, 'done' | 'paused'>, reason: string, deps: RunnerDeps): Promise<void> {
  const updated = await deps.store.updateTask(task.id, { status })
  // 回報失敗不影響任務狀態（任務已經結束），只記日誌
  try {
    await deps.deliverReport(task.user_id, await deps.buildReport(updated))
  } catch (err) {
    console.error('[runner] deliverReport', err)
    await log(task, '回报没送到 AI 朋友', '写入回报失败，任务结果仍保留在任务页与历史')
  }
  await log(task, status === 'done' ? '任务完成，交给 AI 朋友回报' : '任务暂停，交给 AI 朋友回报', reason)
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
