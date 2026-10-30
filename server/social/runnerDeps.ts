// runTaskStep 的預設依賴：跨線一律走 contracts。
// 規劃器（B4）與評審（B5）還沒做，先用下面兩個暫代版本，讓整個迴圈能跑通；做完後把這裡換掉。
import type { AgentTask, Evaluation, LobbyCandidate, Outline, Verdict } from '../../shared/types'
import { deliverReport } from '../contracts/friend'
import { searchLobby } from '../contracts/social'
import { endConversation, markWaitingHuman, runTwinRounds, startConversation } from '../contracts/twin'
import { getAgentStore } from './agentStore'
import { buildReport } from './report'
import type { PickResult, RunnerDeps } from './runner'

export function defaultRunnerDeps(): RunnerDeps {
  const store = getAgentStore()
  return {
    store,
    now: () => new Date(),
    searchLobby,
    pick: pickMostSimilar,
    evaluate: evaluatePlaceholder,
    decide: async () => null, // B4：LLM 決策；目前只用程式規則（decideGuard）
    buildReport: (task) => buildReport(task, store),
    deliverReport,
    startConversation,
    runTwinRounds,
    endConversation,
    markWaitingHuman,
  }
}

/** 暫代 B4 的 pick：選相似度最高的人。 */
export async function pickMostSimilar(_task: AgentTask, candidates: LobbyCandidate[]): Promise<PickResult> {
  const target = candidates[0] ?? null
  return {
    target,
    reason: target ? `相似度最高（${target.similarity}）；规划器尚未接上，先按相似度选` : '没有候选人',
    openingTopic: target?.shareable.interests[0],
  }
}

const EMPTY_OUTLINE: Outline = { topics: [], fits: [], frictions: [], highlights: [], fit_points: [] }

/** 暫代 B5 的 evaluate：判為「不確定」，迴圈會多聊幾輪，到 MAX_ROUNDS 以「聊得不夠深」結束。 */
export async function evaluatePlaceholder(task: AgentTask, _conversationId: string, round: number): Promise<Evaluation> {
  const verdict = (perspective: string): Verdict => ({
    perspective_user_id: perspective,
    direction_score: 0,
    verdict: 'uncertain',
    reason_type: null,
    reason_text: null,
    outline: EMPTY_OUTLINE,
  })
  return { a: verdict(task.user_id), b: verdict(task.attempted_user_ids.at(-1) ?? ''), round }
}
