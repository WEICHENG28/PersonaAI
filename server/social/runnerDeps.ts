// runTaskStep 的預設依賴：跨線一律走 contracts。
import { deliverReport, getAgentProfile, getShareableProfile } from '../contracts/friend.js'
import { searchLobby } from '../contracts/social.js'
import { endConversation, getTranscript, guardText, markWaitingHuman, runTwinRounds, startConversation } from '../contracts/twin.js'
import { getAgentStore } from './agentStore.js'
import { evaluate } from './judge.js'
import { decide, pick } from './planner.js'
import { buildReport } from './report.js'
import type { RunnerDeps } from './runner.js'

export { pickMostSimilar } from './planner.js'

export function defaultRunnerDeps(): RunnerDeps {
  const store = getAgentStore()
  const planner = { store, getAgentProfile, getShareableProfile }
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
    guardText,
  }
}

