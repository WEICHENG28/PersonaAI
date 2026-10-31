// B5｜評審：雙方視角各判 JUDGE_RUNS 次取多數（docs/07B 的 B5、02 第 6.2 節）。擁有者：B。
// 每個視角各自保存大綱與「為什麼你們合」（fit_points），只給該視角的用戶看。
import type { AgentTask, ChatMessage, Purpose, Evaluation, GuardResult, Outline, ReasonType, ShareableProfile, Verdict, VerdictValue } from '../../shared/types.js'
import { CONFIG } from '../lib/config.js'
import { LlmError, llmJson } from '../lib/llm/index.js'
import { writeLog } from '../lib/log.js'
import { judgeSchema, judgeSystem, judgeUser, type JudgeRun } from '../prompts/06_judge.js'
import type { AgentStore } from './agentStore.js'
import { PURPOSE_LABEL } from './task.js'

export interface JudgeContext {
  store: AgentStore
  getTranscript: (conversationId: string) => Promise<ChatMessage[]>
  getShareableProfile: (userId: string) => Promise<ShareableProfile | null>
  guardText: (text: string, ownerUserId: string) => Promise<GuardResult>
}

/** 一次判定的結果（存進 match_scores.runs）。 */
export interface ScoredRun {
  direction_score: number
  verdict: VerdictValue
  reason_type: ReasonType | null
  reason_text: string | null
  outline: Outline
}

const EMPTY_OUTLINE: Outline = { topics: [], fits: [], frictions: [], highlights: [], fit_points: [] }
const VERDICT_LABEL: Record<VerdictValue, string> = { suitable: '合适', unsuitable: '不合适', uncertain: '不确定' }

/** 方向分數 = 六項加權平均 × 20；權重依找人目的（B11，CONFIG.JUDGE_WEIGHTS），交友為等權重。 */
export function directionScore(scores: JudgeRun['scores'], purpose: Purpose = 'friend'): number {
  const weights = CONFIG.JUDGE_WEIGHTS[purpose]
  let sum = 0
  let total = 0
  for (const key of Object.keys(scores) as (keyof JudgeRun['scores'])[]) {
    sum += scores[key] * weights[key]
    total += weights[key]
  }
  return Math.round((sum / total) * 20)
}

export function toScoredRun(run: JudgeRun, purpose: Purpose = 'friend'): ScoredRun {
  const score = directionScore(run.scores, purpose)
  const verdict: VerdictValue = !run.enough_info ? 'uncertain' : score >= CONFIG.JUDGE_THRESHOLD ? 'suitable' : 'unsuitable'
  return {
    direction_score: score,
    verdict,
    reason_type: run.reason_type ?? null,
    reason_text: run.reason_text?.trim() || null,
    outline: run.outline,
  }
}

/** 三次中 2 次以上相同就取那個，否則「不確定」；分數取多數那幾次的平均，原因取其中第一個非空的。 */
export function aggregateRuns(runs: ScoredRun[]): { verdict: VerdictValue; direction_score: number; majority: ScoredRun[] } {
  const counts = new Map<VerdictValue, ScoredRun[]>()
  for (const r of runs) counts.set(r.verdict, [...(counts.get(r.verdict) ?? []), r])
  const top = [...counts.entries()].sort((a, b) => b[1].length - a[1].length)[0]
  if (!top || top[1].length < 2) return { verdict: 'uncertain', direction_score: average(runs), majority: runs }
  return { verdict: top[0], direction_score: average(top[1]), majority: top[1] }
}

/** 取多數那幾次中第一次的大綱；不是「合適」就清空 fit_points；evidence 先過隱私守門（被描述的是對方）。 */
export async function pickOutline(majority: ScoredRun[], verdict: VerdictValue, otherUserId: string, guard: JudgeContext['guardText']): Promise<Outline> {
  const outline = majority[0]?.outline ?? EMPTY_OUTLINE
  if (verdict !== 'suitable') return { ...outline, fit_points: [] }
  const fit_points = await Promise.all(
    outline.fit_points.map(async (p) => ({ ...p, evidence: (await guard(p.evidence, otherUserId)).text })),
  )
  return { ...outline, fit_points }
}

export async function evaluate(task: AgentTask, conversationId: string, round: number, ctx: JudgeContext): Promise<Evaluation> {
  const me = task.user_id
  const other = task.target_user_id ?? task.attempted_user_ids.at(-1) ?? ''
  const [messages, meName, otherName] = await Promise.all([ctx.getTranscript(conversationId), ctx.store.displayName(me), ctx.store.displayName(other)])
  const transcript = formatTranscript(messages, { [me]: meName, [other]: otherName })

  const [a, b] = await Promise.all([
    judgeSide(task, me, meName, other, transcript, ctx),
    judgeSide(task, other, otherName, me, transcript, ctx),
  ])

  await ctx.store.recordScores([a, b].map((s) => ({ conversation_id: conversationId, round, ...s.row })))
  await writeLog({
    user_id: me,
    agent: 'judge',
    task_id: task.id,
    conversation_id: conversationId,
    action: `第 ${round} 轮：你的视角${VERDICT_LABEL[a.verdict.verdict]}、对方视角${VERDICT_LABEL[b.verdict.verdict]}`,
    reason: `${runSummary(a.runs)}；对方视角 ${runSummary(b.runs)}`,
  })
  return { a: a.verdict, b: b.verdict, round }
}

async function judgeSide(task: AgentTask, who: string, whoName: string, other: string, transcript: string, ctx: JudgeContext) {
  const [settings, otherShareable] = await Promise.all([ctx.store.userSettings(who), ctx.getShareableProfile(other)])
  const user = judgeUser({ purpose: PURPOSE_LABEL[task.purpose], preferences: settings.preferences, otherShareable, transcript })
  const results = await Promise.all(
    Array.from({ length: CONFIG.JUDGE_RUNS }, () =>
      llmJson({ role: 'reason', system: judgeSystem(whoName), messages: [{ role: 'user', content: user }], schema: judgeSchema, temperature: 0.7 })
        .then((run) => toScoredRun(run, task.purpose))
        .catch((err: unknown) => {
          if (!(err instanceof LlmError)) throw err
          console.error('[judge]', err)
          return null // 這一次判定失敗：不計入
        }),
    ),
  )
  const runs = results.filter((r): r is ScoredRun => r !== null)
  const agg = aggregateRuns(runs)
  const first = agg.majority.find((r) => r.reason_type || r.reason_text)
  const verdict: Verdict = {
    perspective_user_id: who,
    direction_score: agg.direction_score,
    verdict: agg.verdict,
    reason_type: agg.verdict === 'unsuitable' ? (first?.reason_type ?? null) : null,
    reason_text: agg.verdict === 'unsuitable' ? (first?.reason_text ?? null) : null,
    outline: await pickOutline(agg.majority, agg.verdict, other, ctx.guardText),
  }
  const row = {
    perspective_user_id: who,
    runs,
    direction_score: verdict.direction_score,
    verdict: verdict.verdict,
    reason_type: verdict.reason_type,
    reason_text: verdict.reason_text,
  }
  return { verdict, runs, row }
}

/** 第 n 輪 = 依時間排序的第 2n−1、2n 則（雙方各說一次算一輪）。 */
export function formatTranscript(messages: ChatMessage[], names: Record<string, string>): string {
  return messages.map((m, i) => `第${Math.floor(i / 2) + 1}轮 ${names[m.sender_id] ?? '对方'}：${m.content}`).join('\n')
}

function runSummary(runs: ScoredRun[]): string {
  if (runs.length === 0) return '评审暂时没有回应'
  const counts = new Map<VerdictValue, number>()
  for (const r of runs) counts.set(r.verdict, (counts.get(r.verdict) ?? 0) + 1)
  return `${runs.length} 次判定：` + [...counts.entries()].map(([v, n]) => `${n} ${VERDICT_LABEL[v]}`).join(' ')
}

function average(runs: ScoredRun[]): number {
  return runs.length ? Math.round(runs.reduce((s, r) => s + r.direction_score, 0) / runs.length) : 0
}
