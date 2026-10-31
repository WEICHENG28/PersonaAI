// B4｜規劃器：用 LLM 挑下一位、決定代聊下一步（docs/07B 的 B4、Prompt 4）。擁有者：B。
// LLM 的輸出一律驗證；無效或沒回應時退回程式規則，任務不會卡住。
import type { AgentProfile, AgentTask, Evaluation, LobbyCandidate, ShareableProfile } from '../../shared/types.js'
import { CONFIG } from '../lib/config.js'
import { LlmError, llmJson } from '../lib/llm/index.js'
import { DECIDE_SYSTEM, PICK_SYSTEM, decideSchema, pickSchema } from '../prompts/04_planner.js'
import type { AgentStore } from './agentStore.js'
import type { DecideAction } from './guards.js'
import type { PickResult } from './runner.js'
import { PURPOSE_LABEL } from './task.js'

export interface PlannerContext {
  store: AgentStore
  /** A 的 contract；Big Five 只有 B 的後台可以用（07 第 7 節隱私分層）。 */
  getAgentProfile: (userId: string) => Promise<AgentProfile | null>
  /** A 的 contract：用戶自己的對外檔案（開場話題要用雙方共同的興趣）。 */
  getShareableProfile: (userId: string) => Promise<ShareableProfile | null>
}

const PICK_ATTEMPTS = 2

export async function pick(task: AgentTask, candidates: LobbyCandidate[], ctx: PlannerContext): Promise<PickResult> {
  const mine = await ctx.getShareableProfile(task.user_id)
  const myInterests = mine?.interests ?? []
  const user = await pickInput(task, candidates, mine, ctx)
  let invalid = false
  for (let attempt = 1; attempt <= PICK_ATTEMPTS; attempt++) {
    let out
    try {
      out = await llmJson({ role: 'reason', system: PICK_SYSTEM, messages: [{ role: 'user', content: user }], schema: pickSchema, temperature: 0.3 })
    } catch (err) {
      if (!(err instanceof LlmError)) throw err
      console.error('[planner.pick]', err)
      return fallback(task, candidates, '规划器暂时没有回应，改用相似度最高者', myInterests)
    }
    if (out.tool === 'finish') return { target: null, reason: cleanReason(out.reason, '候选人都不太合适') }
    const target = candidates.find((c) => c.user_id === out.args.target_user_id)
    if (target) {
      const openingTopic = chooseOpeningTopic(out.args.opening_topic, myInterests, target.shareable.interests, task.conditions)
      return { target, reason: cleanReason(out.reason, '和任务条件相符'), openingTopic }
    }
    invalid = true
  }
  return fallback(task, candidates, invalid ? '规划器输出无效，改用相似度最高者' : '改用相似度最高者', myInterests)
}

export async function decide(task: AgentTask, ev: Evaluation, ctx: PlannerContext): Promise<{ action: DecideAction; reason: string } | null> {
  const settings = await ctx.store.userSettings(task.user_id)
  const input = {
    档位: settings.match_tier,
    用户视角判定: ev.a.verdict,
    对方视角判定: ev.b.verdict,
    目前轮数: ev.round,
    最大轮数: CONFIG.MAX_ROUNDS,
    任务进度: task.progress,
  }
  try {
    const out = await llmJson({
      role: 'reason',
      system: DECIDE_SYSTEM,
      messages: [{ role: 'user', content: `输入：${JSON.stringify(input)}` }],
      schema: decideSchema,
      temperature: 0.3,
    })
    return { action: out.tool, reason: cleanReason(out.reason, '依评审结果决定') }
  } catch (err) {
    if (!(err instanceof LlmError)) throw err
    console.error('[planner.decide]', err)
    return null // 交給 decideGuard 的程式規則
  }
}

/** 理由不能出現分數（02 第 6.1 節：不顯示分數）；有的話換成通用說法。 */
export function cleanReason(reason: string, fallbackText: string): string {
  const text = reason.trim()
  return !text || /\d+(\.\d+)?\s*分|\d+\s*%|0\.\d+|相似度|score/i.test(text) ? fallbackText : text
}

async function pickInput(task: AgentTask, candidates: LobbyCandidate[], mine: ShareableProfile | null, ctx: PlannerContext): Promise<string> {
  const [profile, settings] = await Promise.all([ctx.getAgentProfile(task.user_id), ctx.store.userSettings(task.user_id)])
  const input = {
    任务: { 目的: PURPOSE_LABEL[task.purpose], 条件: task.conditions, 说明: task.restatement },
    用户: { 对外档案: mine, 偏好: settings.preferences, 后台档案: profile },
    候选人: candidates.map((c) => ({
      user_id: c.user_id,
      名字: c.display_name,
      对外档案: c.shareable,
      和任务的接近程度: c.similarity >= 0.7 ? '高' : c.similarity >= 0.5 ? '中' : '低',
    })),
  }
  return `输入：${JSON.stringify(input)}`
}

/** 選相似度最高的人（LLM 無效或沒回應時的退路）。 */
export async function pickMostSimilar(task: AgentTask, candidates: LobbyCandidate[], myInterests: string[] = []): Promise<PickResult> {
  const target = candidates[0] ?? null
  return {
    target,
    reason: target ? '相似度最高' : '没有候选人',
    openingTopic: target ? chooseOpeningTopic(undefined, myInterests, target.shareable.interests, task.conditions) : undefined,
  }
}

/**
 * 開場話題必須是「我」也有的興趣或任務條件，否則分身會為了接話編造自己沒有的喜好（實跑時用了對方的「手冲咖啡」）。
 * 規劃器給的話題有提到我的興趣或任務條件就採用；否則改用雙方共同興趣，再不然用任務條件或我的第一個興趣。
 */
export function chooseOpeningTopic(suggested: string | undefined, mine: string[], theirs: string[], conditions: string[]): string | undefined {
  const keys = [...mine, ...conditions.map((c) => c.replace(/^喜欢|^爱/, ''))].map((k) => k.trim()).filter(Boolean)
  if (suggested && keys.some((k) => suggested.includes(k))) return suggested
  const common = mine.find((m) => theirs.some((t) => t.includes(m) || m.includes(t)))
  return common ?? keys[0] ?? suggested
}

async function fallback(task: AgentTask, candidates: LobbyCandidate[], note: string, myInterests: string[]): Promise<PickResult> {
  const result = await pickMostSimilar(task, candidates, myInterests)
  return { ...result, reason: result.target ? note : result.reason }
}
