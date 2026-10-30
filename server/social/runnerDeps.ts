// runTaskStep 的預設依賴：跨線一律走 contracts。
import { deliverReport, getAgentProfile, getShareableProfile } from '../contracts/friend'
import { searchLobby } from '../contracts/social'
import { endConversation, getTranscript, guardText, markWaitingHuman, runTwinRounds, startConversation } from '../contracts/twin'
import { getAgentStore } from './agentStore'
import { evaluate } from './judge'
import { decide, pick } from './planner'
import { buildReport } from './report'
import type { RunnerDeps } from './runner'

export { pickMostSimilar } from './planner'

export function defaultRunnerDeps(): RunnerDeps {
  const store = getAgentStore()
  const planner = { store, getAgentProfile }
  const judge = { store, getTranscript, getShareableProfile, guardText }
  return {
    store,
    now: () => new Date(),
    searchLobby,
    pick: (task, candidates) => pick(task, candidates, planner),
    evaluate: (task, conversationId, round) => evaluate(task, conversationId, round, judge),
    decide: (task, ev) => decide(task, ev, planner),
    buildReport: (task) => buildReport(task, store),
    deliverReport,
    startConversation,
    runTwinRounds,
    endConversation,
    markWaitingHuman,
  }
}

