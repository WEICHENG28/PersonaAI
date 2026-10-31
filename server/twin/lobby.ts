// C9／C10 大廳與大廳 AI 助手（docs/07C）。擁有者：C。
// 候選人來自 B 的 searchLobby（contracts/social）；畫面只拿文字，不回任何分數數字。
// 外部依賴（B、A、C3 的 contracts、LLM）都放在 LobbyDeps，測試可以換成假的。
import { z } from 'zod'
import type {
  AgentTask,
  LobbyCandidate,
  LobbyQuery,
  Purpose,
  ShareableProfile,
  StartConversationInput,
} from '../../shared/types'
import type { LlmJsonOptions } from '../lib/llm'
import { lobbyAssistantSchema, renderLobbyAssistantSystem } from '../prompts/11_lobby_assistant'

/** 大廳卡片上的 AI 預估（07C C9：依 similarity 分三級，不顯示數字）。 */
export type LobbyFit = 'likely' | 'maybe' | 'different'

/**
 * 門檻依實際資料定（2026-10-31，c-test1 用 myQueryText 查大廳 13 人：有共同興趣的 0.60～0.82，沒有的 0.43～0.53）。
 * 用整份檔案（shareableToText）當查詢時兩群會混在一起（雨晴 0.62），所以改用興趣＋想找。
 */
export const FIT_LIKELY = 0.6
export const FIT_MAYBE = 0.5
/** 大廳列表最多幾位、助手參考幾位、助手附幾張卡片。 */
export const LOBBY_LIST_LIMIT = 20
export const ASSISTANT_SEARCH_LIMIT = 5
/** 助手先多搜幾位，問題裡點名的人才找得到（「小安和子晴谁比较适合我？」）。 */
export const ASSISTANT_POOL_LIMIT = 20
export const ASSISTANT_CARD_LIMIT = 3
const ASSISTANT_TEMPERATURE = 0.5

export interface LobbyCardView {
  userId: string
  name: string
  intro: string
  interests: string[]
  chatStyle: string
  lookingFor: string
  /** 只有大廳列表有；助手附的小卡片是依問題搜尋的，不放預估。 */
  fit: LobbyFit | null
}

export type AssistantView =
  | { kind: 'task'; taskId: string }
  | { kind: 'answer'; answer: string; cards: LobbyCardView[] }

export class LobbyError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 503 = 400,
  ) {
    super(message)
    this.name = 'LobbyError'
  }
}

export interface LobbyDeps {
  searchLobby(userId: string, q: LobbyQuery): Promise<LobbyCandidate[]>
  getShareableProfile(userId: string): Promise<ShareableProfile | null>
  createTaskFromText(userId: string, text: string): Promise<AgentTask>
  createSingleTargetTask(userId: string, targetUserId: string): Promise<AgentTask>
  startConversation(input: StartConversationInput): Promise<{ conversationId: string }>
  llmJson<T>(opts: LlmJsonOptions<T>): Promise<T>
}

export interface LobbyApi {
  list(userId: string, filter?: LobbyFilter): Promise<LobbyCardView[]>
  ask(userId: string, question: string): Promise<AssistantView>
  twinChat(userId: string, targetUserId: string): Promise<{ taskId: string }>
  humanChat(userId: string, targetUserId: string): Promise<{ conversationId: string }>
}

const PURPOSES = ['friend', 'study', 'sport', 'hobby'] as const satisfies readonly Purpose[]
export const lobbyFilterSchema = z.object({
  purpose: z.enum(PURPOSES).optional(),
  q: z.string().trim().max(50).optional(),
})
export type LobbyFilter = z.infer<typeof lobbyFilterSchema>
export const QUESTION_MAX = 200
export const questionSchema = z.object({ question: z.string().trim().min(1).max(QUESTION_MAX) })

/** 像在交辦任務（「帮我找」「帮我约」等）就交給 B 建任務（07C C10 第 1 點）。 */
const TASK_PATTERN = /(帮|幫|替)我(找|约|約|配|物色)|帮忙找|幫忙找/

export function isTaskRequest(question: string): boolean {
  return TASK_PATTERN.test(question)
}

export function fitOf(similarity: number): LobbyFit {
  if (similarity >= FIT_LIKELY) return 'likely'
  if (similarity >= FIT_MAYBE) return 'maybe'
  return 'different'
}

export function toCard(c: LobbyCandidate, withFit: boolean): LobbyCardView {
  return {
    userId: c.user_id,
    name: c.display_name,
    intro: c.shareable.intro,
    interests: [...c.shareable.interests],
    chatStyle: c.shareable.chat_style,
    lookingFor: c.shareable.looking_for,
    fit: withFit ? fitOf(c.similarity) : null,
  }
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

function taskErrorOf(err: unknown): LobbyError | null {
  // B 的 TaskError（server/social/task.ts，不能直接 import）：message 是給用戶看的，status 是 HTTP 狀態碼
  if (err instanceof Error && err.name === 'TaskError') {
    const status = (err as Error & { status?: number }).status
    return new LobbyError(err.message, status === 403 || status === 404 ? status : 400)
  }
  return null
}

async function withTaskErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    throw taskErrorOf(err) ?? err
  }
}

/** 用自己的興趣與想找的人當查詢（一行，B 的「搜索大厅」日誌也比較好讀）。 */
export function myQueryText(me: ShareableProfile): string {
  return `兴趣：${me.interests.join('、')}；想找：${me.looking_for}`
}

/** 問題裡點名的人排最前面，其他照相似度補到 limit 位。 */
export function pickForQuestion(found: readonly LobbyCandidate[], question: string, limit: number): LobbyCandidate[] {
  const named = found.filter((c) => c.display_name.length >= 2 && question.includes(c.display_name))
  const rest = found.filter((c) => !named.includes(c))
  return [...named, ...rest].slice(0, Math.max(limit, named.length))
}

async function list(deps: LobbyDeps, userId: string, filter: LobbyFilter = {}): Promise<LobbyCardView[]> {
  const me = await deps.getShareableProfile(userId)
  // 有關鍵字就照關鍵字找；沒有就用自己的興趣找，AI 預估才是「跟我合不合」
  const text = filter.q || (me ? myQueryText(me) : undefined)
  const conditions = filter.q ? [filter.q] : []
  const found = await deps.searchLobby(userId, { text, purpose: filter.purpose, conditions, limit: LOBBY_LIST_LIMIT })
  return found.map((c) => toCard(c, !filter.q))
}

async function answerQuestion(deps: LobbyDeps, userId: string, question: string): Promise<AssistantView> {
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
  const cards = (picked.length ? picked : found).slice(0, ASSISTANT_CARD_LIMIT).map((c) => toCard(c, false))
  return { kind: 'answer', answer, cards }
}

async function ask(deps: LobbyDeps, userId: string, question: string): Promise<AssistantView> {
  if (isTaskRequest(question)) {
    const task = await withTaskErrors(() => deps.createTaskFromText(userId, question))
    return { kind: 'task', taskId: task.id }
  }
  try {
    return await answerQuestion(deps, userId, question)
  } catch (err) {
    if (err instanceof LobbyError) throw err
    console.error('[lobby] 大厅助手失败', err)
    throw new LobbyError('大厅助手刚才没回上，请再问一次', 503)
  }
}

function requireOther(userId: string, targetUserId: string): void {
  if (userId === targetUserId) throw new LobbyError('不能和自己聊天')
}

export function createLobbyApi(deps: LobbyDeps): LobbyApi {
  return {
    list: (userId, filter) => list(deps, userId, filter),
    ask: (userId, question) => ask(deps, userId, question),
    async twinChat(userId, targetUserId) {
      requireOther(userId, targetUserId)
      const task = await withTaskErrors(() => deps.createSingleTargetTask(userId, targetUserId))
      return { taskId: task.id }
    },
    async humanChat(userId, targetUserId) {
      requireOther(userId, targetUserId)
      return deps.startConversation({ aUserId: userId, bUserId: targetUserId, aController: 'human', origin: 'manual' })
    },
  }
}
