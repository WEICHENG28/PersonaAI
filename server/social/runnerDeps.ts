// runTaskStep 的預設依賴：跨線一律走 contracts。
// 評審（B5）還沒做，先用下面的暫代版本，讓整個迴圈能跑通；做完後把這裡換掉。
import type { AgentTask, Evaluation, Outline, Verdict } from '../../shared/types'
import { deliverReport, getAgentProfile } from '../contracts/friend'
import { searchLobby } from '../contracts/social'
import { endConversation, markWaitingHuman, runTwinRounds, startConversation } from '../contracts/twin'
import { getAgentStore } from './agentStore'
import { decide, pick } from './planner'
import { buildReport } from './report'
import type { RunnerDeps } from './runner'

export { pickMostSimilar } from './planner'

export function defaultRunnerDeps(): RunnerDeps {
  const store = getAgentStore()
  const planner = { store, getAgentProfile }
  return {
    store,
    now: () => new Date(),
    searchLobby,
    pick: (task, candidates) => pick(task, candidates, planner),
    evaluate: evaluatePlaceholder,
    decide: (task, ev) => decide(task, ev, planner),
    buildReport: (task) => buildReport(task, store),
    deliverReport,
    startConversation,
    runTwinRounds,
    endConversation,
    markWaitingHuman,
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
