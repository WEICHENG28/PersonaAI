// C5 代聊結果頁後端（docs/07C C5）。擁有者：C。
// 結果頁資料：我方視角的判定與走勢、雙向合適、為什麼你們合、對話大綱、完整紀錄；以及「讓分身繼續聊」。
// 隱私：只讀目前登入者自己的 match_attempts 和 match_scores；對方視角的大綱、理由、分數一律不讀也不回。
// 外部依賴（資料庫、代聊函式、日誌）都放在 ResultDeps，測試可以換成假的。
import { z } from 'zod'
import type { AgentLogInput, Controller, FitPoint, VerdictValue } from '../../shared/types'
import {
  ChatRoomError,
  loadSides,
  toVerdictValue,
  trendOf,
  type ChatMessageView,
  type ChatRoomStore,
  type Trend,
} from './chatRoom'
import type { ConversationRow } from './conversation'
import type { ConversationStatus } from './twin'

/** 「為什麼你們合」最多幾點（07 第 5 節 Outline.fit_points）。 */
export const FIT_POINTS_MAX = 3
/** 算走勢要讀幾筆判定（最新＋前一筆）。 */
const TREND_SCORES = 2

export interface OutlineView {
  topics: string[]
  fits: string[]
  frictions: string[]
  highlights: string[]
}

export interface ResultMessage extends ChatMessageView {
  /** 第幾輪：和 B5 評審看到的逐輪格式相同，fit_points 的 round 指的就是它。 */
  round: number
}

export interface ResultView {
  conversationId: string
  status: ConversationStatus
  me: { userId: string; controller: Controller }
  other: { userId: string; name: string; controller: Controller }
  /** 我方視角的最新判定；只有文字代碼，沒有分數。 */
  verdict: { value: VerdictValue; trend: Trend } | null
  /** 我方那筆 match_attempts 的結果是雙向合適。 */
  mutual: boolean
  /** 為什麼你們合：我方視角判定合適時才有。 */
  fitPoints: FitPoint[]
  outline: OutlineView | null
  messages: ResultMessage[]
  /** null = 可以讓分身繼續聊；否則是不行的原因（簡體，直接給用戶看）。 */
  continueBlock: string | null
}

export interface ContinueResult {
  roundCount: number
  ended: boolean
}

/** match_attempts 裡結果頁用得到的欄位。 */
export interface AttemptRow {
  result: string
  outline: unknown
}

export interface ResultStore extends Pick<ChatRoomStore, 'getConversation' | 'getDisplayName' | 'listMessages' | 'listMyScores'> {
  /** 這位用戶在這段對話最新的一筆 match_attempts；沒有回 null。 */
  getMyLatestAttempt(conversationId: string, userId: string): Promise<AttemptRow | null>
  /** 等本人（waiting_human）的對話改回 active；其他狀態不動。 */
  resumeConversation(conversationId: string): Promise<void>
}

export interface ResultDeps {
  store: ResultStore
  runTwinRounds(conversationId: string, rounds: number): Promise<ContinueResult>
  writeLog(entry: AgentLogInput): Promise<void>
  roundsPerStep: number
  maxRounds: number
}

export interface ResultApi {
  getResult(conversationId: string, userId: string): Promise<ResultView>
  continueTwin(conversationId: string, userId: string): Promise<ContinueResult>
}

const stringList = z.array(z.string()).catch([])

const outlineSchema = z.object({
  topics: stringList,
  fits: stringList,
  frictions: stringList,
  highlights: stringList,
  fit_points: z
    .array(z.object({ concern: z.string(), evidence: z.string(), round: z.coerce.number().int().min(1) }))
    .catch([])
    .transform((points) => points.slice(0, FIT_POINTS_MAX)),
})

export type ParsedOutline = z.infer<typeof outlineSchema>

/** 讀 match_attempts.outline（jsonb，來自 LLM）：不是物件回 null；個別欄位壞掉就當成空的。 */
export function parseOutline(raw: unknown): ParsedOutline | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const parsed = outlineSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

/**
 * 每則訊息標上第幾輪：第 n 輪＝依時間排序的第 2n−1、2n 則。
 * 必須和 B5 評審的 formatTranscript（server/social/judge.ts）一致，fit_points 的輪數才對得上。
 */
export function withRounds(messages: readonly ChatMessageView[]): ResultMessage[] {
  return messages.map((m, i) => ({ ...m, round: Math.floor(i / 2) + 1 }))
}

interface Side {
  userId: string
  controller: Controller
}

/** 不能讓分身繼續聊的原因；可以時回 null。 */
export function continueBlock(conv: ConversationRow, me: Side, other: Side, maxRounds: number): string | null {
  if (conv.status === 'ended') return '这段对话已经结束了'
  if (me.controller !== 'twin') return '你已经本人接手了，直接在聊天室里聊吧'
  if (other.controller !== 'twin') return '对方本人在聊，分身不会自己继续'
  if (conv.round_count >= maxRounds) return `已经聊到上限（${maxRounds} 轮），可以本人接手继续聊`
  return null
}

async function getResult(deps: ResultDeps, conversationId: string, userId: string): Promise<ResultView> {
  const { conv, me, other } = await loadSides(deps.store, conversationId, userId)
  // 只讀「我」這個視角：自己的判定、自己那筆紀錄
  const [name, messages, scores, attempt] = await Promise.all([
    deps.store.getDisplayName(other.userId),
    deps.store.listMessages(conversationId),
    deps.store.listMyScores(conversationId, me.userId, TREND_SCORES),
    deps.store.getMyLatestAttempt(conversationId, me.userId),
  ])
  const latest = scores[0]
  const verdict = latest ? { value: toVerdictValue(latest.verdict), trend: trendOf(scores) } : null
  const outline = parseOutline(attempt?.outline)
  return {
    conversationId: conv.id,
    status: conv.status,
    me: { ...me },
    other: { ...other, name },
    verdict,
    mutual: attempt?.result === 'mutual',
    fitPoints: verdict?.value === 'suitable' && outline ? outline.fit_points : [],
    outline: outline ? { topics: outline.topics, fits: outline.fits, frictions: outline.frictions, highlights: outline.highlights } : null,
    messages: withRounds(messages),
    continueBlock: continueBlock(conv, me, other, deps.maxRounds),
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function continueTwin(deps: ResultDeps, running: Set<string>, conversationId: string, userId: string): Promise<ContinueResult> {
  const { conv, me, other } = await loadSides(deps.store, conversationId, userId)
  const block = continueBlock(conv, me, other, deps.maxRounds)
  if (block) throw new ChatRoomError(block, 409)
  if (running.has(conv.id)) throw new ChatRoomError('分身已经在聊了，稍等一下', 409)

  running.add(conv.id)
  const log = { user_id: me.userId, agent: 'twin' as const, conversation_id: conv.id, task_id: conv.task_id ?? undefined }
  try {
    // runTwinRounds 只推進 active 的對話；等本人的對話要先改回 active
    if (conv.status === 'waiting_human') await deps.store.resumeConversation(conv.id)
    await deps.writeLog({ ...log, action: '让分身继续聊', reason: `你在结果页选择让分身再聊 ${deps.roundsPerStep} 轮` })
    return await deps.runTwinRounds(conv.id, deps.roundsPerStep)
  } catch (err) {
    if (err instanceof ChatRoomError) throw err
    console.error('[twin] 让分身继续聊失败', conv.id, err)
    await deps.writeLog({ ...log, action: '分身继续聊时出错', reason: '分身回复时出错，已经聊到的内容会保留', detail: { error: errorText(err) } })
    throw new ChatRoomError('分身暂时没有回应，已经聊到的内容会保留，稍后再试一次', 503)
  } finally {
    running.delete(conv.id)
  }
}

export function createResultApi(deps: ResultDeps): ResultApi {
  // 同一段對話同時只跑一次「繼續聊」（雙方都可能按、或連按兩次）
  const running = new Set<string>()
  return {
    getResult: (id, userId) => getResult(deps, id, userId),
    continueTwin: (id, userId) => continueTwin(deps, running, id, userId),
  }
}
