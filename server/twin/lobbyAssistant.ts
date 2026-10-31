// C10 大廳 AI 助手（docs/07C C10）。擁有者：C。
// 從 PR #88（c/twin-quality）搬來，改成和 C9 共用卡片（lobby.ts 的 cardViewOf）。
// 像交辦任務（「帮我找」「帮我约」）→ B 的 createTaskFromText；其他問題 → searchLobby → Prompt 11 → 回答＋候選人小卡片。
// 回答與卡片都不能出現分數數字：Prompt 禁止 → 有就重問一次 → 還有就拿掉。
import type { AgentTask, LobbyCandidate, LobbyQuery, ShareableProfile } from '../../shared/types.js'
import type { LlmJsonOptions } from '../lib/llm/index.js'
import { lobbyAssistantSchema, renderLobbyAssistantSystem } from '../prompts/11_lobby_assistant.js'
import { ChatRoomError } from './chatRoom.js'

export const ASSISTANT_SEARCH_LIMIT = 5
/** 先多搜幾位，問題裡點名的人才找得到（「小安和子晴谁比较适合我？」）。 */
export const ASSISTANT_POOL_LIMIT = 20
export const ASSISTANT_CARD_LIMIT = 3
const ASSISTANT_TEMPERATURE = 0.5
export const QUESTION_MAX = 200
export const ASSISTANT_FAILED = '大厅助手刚才没回上，请再问一次'

/** 像在交辦任務（「帮我找」「帮我约」等）就交給 B 建任務（07C C10 第 1 點）。 */
const TASK_PATTERN = /(帮|幫|替)我(找|约|約|配|物色)|帮忙找|幫忙找/

export function isTaskRequest(question: string): boolean {
  return TASK_PATTERN.test(question)
}

/** 像分數的數字：「契合度 82」「82 分」「82%」「第 1 名」。人數、輪數這種不算。 */
const SCORE_PATTERN = /(契合度|匹配度|相似度|分数|评分|得分|指数)\s*[:：为是]?\s*\d|\d+(\.\d+)?\s*(分|%|％|成)(?![钟享])|第\s*\d+\s*名|Big\s*Five|大五/i

export function hasScoreNumber(text: string): boolean {
  return SCORE_PATTERN.test(text)
}

/** 最後一道：拿掉像分數的片段（模型重試後還是寫了分數時）。 */
export function stripScores(text: string): string {
  return text
    .replace(/(契合度|匹配度|相似度|分数|评分|得分|指数)\s*[:：为是]?\s*\d+(\.\d+)?\s*(分|%|％)?/g, '')
    .replace(/\d+(\.\d+)?\s*(分|%|％|成)(?![钟享])/g, '')
    .replace(/第\s*\d+\s*名/g, '')
    .replace(/Big\s*Five|大五人格|大五/gi, '')
    .replace(/[，、]\s*([，。、])/g, '$1')
    .trim()
}

/** 問題裡點名的人排最前面，其他照相似度補到 limit 位。 */
export function pickForQuestion(found: readonly LobbyCandidate[], question: string, limit: number): LobbyCandidate[] {
  const named = found.filter((c) => c.display_name.length >= 2 && question.includes(c.display_name))
  const rest = found.filter((c) => !named.includes(c))
  return [...named, ...rest].slice(0, Math.max(limit, named.length))
}

export interface AssistantDeps<Card> {
  searchLobby(userId: string, q: LobbyQuery): Promise<LobbyCandidate[]>
  getShareableProfile(userId: string): Promise<ShareableProfile | null>
  createTaskFromText(userId: string, text: string): Promise<AgentTask>
  llmJson<T>(opts: LlmJsonOptions<T>): Promise<T>
  /** 候選人 → 畫面卡片（大廳卡片快取，不放 AI 預估）。 */
  toCards(candidates: LobbyCandidate[]): Promise<Card[]>
  /** B 的錯誤（TaskError）轉成給用戶看的錯誤。 */
  withTaskErrors<T>(run: () => Promise<T>): Promise<T>
}

export type AssistantView<Card> = { kind: 'task'; taskId: string } | { kind: 'answer'; answer: string; cards: Card[] }

async function answerQuestion<Card>(deps: AssistantDeps<Card>, userId: string, question: string): Promise<AssistantView<Card>> {
  const [me, pool] = await Promise.all([
    deps.getShareableProfile(userId),
    deps.searchLobby(userId, { text: question, limit: ASSISTANT_POOL_LIMIT }),
  ])
  const found = pickForQuestion(pool, question, ASSISTANT_SEARCH_LIMIT)
  const system = renderLobbyAssistantSystem(me, found)
  const ask = (content: string) =>
    deps.llmJson({ role: 'chat', system, messages: [{ role: 'user', content }], temperature: ASSISTANT_TEMPERATURE, schema: lobbyAssistantSchema })
  const userTurn = `用户的问题：${question}\n只输出 JSON。`
  let reply = await ask(userTurn)
  if (hasScoreNumber(reply.answer)) {
    reply = await ask(`${userTurn}\n注意：回答里不能出现任何分数、百分比或排名数字，也不能提 Big Five。`)
  }
  const answer = hasScoreNumber(reply.answer) ? stripScores(reply.answer) : reply.answer
  const byId = new Map(found.map((c) => [c.user_id, c]))
  const picked = [...new Set(reply.card_user_ids)].flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
  const cards = await deps.toCards((picked.length ? picked : found).slice(0, ASSISTANT_CARD_LIMIT))
  return { kind: 'answer', answer, cards }
}

export async function askAssistant<Card>(deps: AssistantDeps<Card>, userId: string, question: string): Promise<AssistantView<Card>> {
  if (isTaskRequest(question)) {
    const task = await deps.withTaskErrors(() => deps.createTaskFromText(userId, question))
    return { kind: 'task', taskId: task.id }
  }
  try {
    return await answerQuestion(deps, userId, question)
  } catch (err) {
    if (err instanceof ChatRoomError) throw err
    console.error('[twin] 大厅助手失败', err)
    throw new ChatRoomError(ASSISTANT_FAILED, 503)
  }
}
