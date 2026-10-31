// C6 本人接手（docs/07C C6）。擁有者：C。
// POST /api/conversations/:id/takeover：確認是對話一方且我方還是分身 → 我方 controller 改成本人、對話改回 active
// → Prompt 7 產生接手摘要（只放我方視角的判定）→ 寫入 handoffs → 寫日誌。接手後不再交回分身。
// 外部依賴（資料庫、LLM、日誌）都放在 HandoffDeps，測試可以換成假的。
import type { AgentLogInput, VerdictValue } from '../../shared/types.js'
import type { LlmJsonOptions } from '../lib/llm/index.js'
import {
  EMPTY_HANDOFF_SUMMARY,
  handoffSummarySchema,
  handoffUserMessage,
  renderHandoffSystem,
  type HandoffSummary,
} from '../prompts/07_handoff.js'
import {
  ChatRoomError,
  loadSides,
  toVerdictValue,
  trendOf,
  type ChatMessageView,
  type ChatRoomStore,
  type Trend,
} from './chatRoom.js'
import type { ConversationRow } from './conversation.js'

/** 帶入 Prompt 7 的最近訊息數（MAX_ROUNDS 輪全部放得下）。 */
export const HANDOFF_TRANSCRIPT_LIMIT = 40
const HANDOFF_TEMPERATURE = 0.3
/** 算走勢要讀幾筆判定（最新＋前一筆）。 */
const TREND_SCORES = 2

const VERDICT_TEXT: Record<VerdictValue, string> = { suitable: '合适', uncertain: '还在观察', unsuitable: '不太合适' }
const TREND_TEXT: Record<Trend, string> = { up: '走势上升', flat: '走势持平', down: '走势下降' }

export type Side = 'a' | 'b'

export interface TakeoverView {
  conversationId: string
  /** 我方視角的最新判定；只有文字代碼，沒有分數。 */
  verdict: { value: VerdictValue; trend: Trend } | null
  summary: HandoffSummary
  /** 接手摘要沒產生出來（已經照常接手，卡片內容是空的）。 */
  summaryFailed: boolean
}

export interface NewHandoff {
  conversation_id: string
  user_id: string
  summary: HandoffSummary
}

export interface HandoffStore extends Pick<ChatRoomStore, 'getConversation' | 'listMessages' | 'listMyScores'> {
  /** 這一方改成本人、對話改回 active；只在這一方還是分身且對話沒結束時改。回傳有沒有改到。 */
  switchToHuman(conversationId: string, side: Side): Promise<boolean>
  insertHandoff(row: NewHandoff): Promise<void>
}

export interface HandoffDeps {
  store: HandoffStore
  llmJson<T>(opts: LlmJsonOptions<T>): Promise<T>
  writeLog(entry: AgentLogInput): Promise<void>
}

export interface HandoffApi {
  takeOver(conversationId: string, userId: string): Promise<TakeoverView>
}

interface MySide {
  userId: string
  controller: ConversationRow['side_a_controller']
}

/** 不能接手的原因；可以時回 null。 */
export function takeoverBlock(conv: ConversationRow, me: MySide): string | null {
  if (conv.status === 'ended') return '这段对话已经结束了'
  if (me.controller !== 'twin') return '你已经本人接手了，直接在聊天室里聊吧'
  return null
}

/** 「合适，走势上升」；還沒有判定時說明一下。只放我方視角。 */
export function myVerdictText(verdict: TakeoverView['verdict']): string {
  return verdict ? `${VERDICT_TEXT[verdict.value]}，${TREND_TEXT[verdict.trend]}` : '还没有判定'
}

/** 把對話排成「你的分身：…／对方的分身：…」，只取最近 HANDOFF_TRANSCRIPT_LIMIT 則。 */
export function formatHandoffTranscript(messages: readonly ChatMessageView[], myUserId: string): string {
  if (messages.length === 0) return '（还没有消息）'
  return messages
    .slice(-HANDOFF_TRANSCRIPT_LIMIT)
    .map((m) => `${speakerName(m, myUserId)}：${m.content}`)
    .join('\n')
}

/** 告訴 Prompt 7 最後一則是誰說的：最後是我方說的，建議接話就不要回答自己剛問的問題。 */
export function lastSpeakerNote(messages: readonly ChatMessageView[], myUserId: string): string {
  const last = messages.at(-1)
  if (!last) return '还没有消息，建议接话写开场白。'
  if (last.sender_id === myUserId) {
    return (
      `最后一则是「${speakerName(last, myUserId)}」说的：「${last.content}」对方还没回。` +
      'suggested_replies 不要回答这一则里问对方的问题，也不要说自己的答案，写等对方回答后的追问，或换个纪录里提过的话题。'
    )
  }
  return `最后一则是「${speakerName(last, myUserId)}」说的，轮到你回应。`
}

function speakerName(m: ChatMessageView, myUserId: string): string {
  if (m.sender_id === myUserId) return m.is_ai ? '你的分身' : '你本人'
  return m.is_ai ? '对方的分身' : '对方本人'
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

interface SummaryOutcome {
  summary: HandoffSummary
  error: string | null
}

/** Prompt 7；失敗時照常接手，卡片給空的內容（錯誤記在日誌 detail）。 */
async function summarize(
  deps: HandoffDeps,
  input: { messages: readonly ChatMessageView[]; myUserId: string; verdict: TakeoverView['verdict'] },
): Promise<SummaryOutcome> {
  const transcript = formatHandoffTranscript(input.messages, input.myUserId)
  try {
    const summary = await deps.llmJson({
      role: 'fast',
      system: renderHandoffSystem(myVerdictText(input.verdict)),
      messages: [{ role: 'user', content: handoffUserMessage(transcript, lastSpeakerNote(input.messages, input.myUserId)) }],
      temperature: HANDOFF_TEMPERATURE,
      schema: handoffSummarySchema,
    })
    return { summary, error: null }
  } catch (err) {
    console.error('[twin] 接手摘要产生失败', err)
    return { summary: EMPTY_HANDOFF_SUMMARY, error: errorText(err) }
  }
}

interface CardOutcome extends SummaryOutcome {
  verdict: TakeoverView['verdict']
}

/** 讀訊息與我方判定，再產生摘要。已經改成本人了，讀取失敗也照常回傳（空白卡片，錯誤給日誌）。 */
async function buildCard(deps: HandoffDeps, conversationId: string, myUserId: string): Promise<CardOutcome> {
  try {
    // 只讀「我」這個視角的判定；對方視角的分數與理由一律不讀
    const [messages, scores] = await Promise.all([
      deps.store.listMessages(conversationId),
      deps.store.listMyScores(conversationId, myUserId, TREND_SCORES),
    ])
    const latest = scores[0]
    const verdict = latest ? { value: toVerdictValue(latest.verdict), trend: trendOf(scores) } : null
    return { verdict, ...(await summarize(deps, { messages, myUserId, verdict })) }
  } catch (err) {
    console.error('[twin] 读取接手卡片资料失败', conversationId, err)
    return { verdict: null, summary: EMPTY_HANDOFF_SUMMARY, error: errorText(err) }
  }
}

/** 寫入 handoffs；失敗不擋接手（已經改成本人了），錯誤回傳給日誌。 */
async function saveHandoff(deps: HandoffDeps, row: NewHandoff): Promise<string | null> {
  try {
    await deps.store.insertHandoff(row)
    return null
  } catch (err) {
    console.error('[twin] 写入 handoffs 失败', row.conversation_id, err)
    return errorText(err)
  }
}

async function takeOver(deps: HandoffDeps, running: Set<string>, conversationId: string, userId: string): Promise<TakeoverView> {
  const { conv, me } = await loadSides(deps.store, conversationId, userId)
  const block = takeoverBlock(conv, me)
  if (block) throw new ChatRoomError(block, 409)
  const key = `${conv.id}:${me.userId}`
  if (running.has(key)) throw new ChatRoomError('正在整理接手卡片，稍等一下', 409)

  running.add(key)
  try {
    // 先改成本人讓分身停下，再讀訊息產生摘要：Prompt 7 要跑好幾秒，先摘要的話分身這段時間說的話會漏掉，
    // 「最後一則是誰說的」也會判斷錯。摘要失敗本來就照常接手，所以先改不會有問題。
    const switched = await deps.store.switchToHuman(conv.id, me.userId === conv.side_a ? 'a' : 'b')
    if (!switched) throw new ChatRoomError('对话状态刚刚有变化，重新打开聊天室看看', 409)

    const { verdict, summary, error } = await buildCard(deps, conv.id, me.userId)

    const handoffError = await saveHandoff(deps, { conversation_id: conv.id, user_id: me.userId, summary })
    const detail: Record<string, unknown> = {}
    if (error) detail.summary_error = error
    if (handoffError) detail.handoff_error = handoffError
    await deps.writeLog({
      user_id: me.userId,
      agent: 'twin',
      conversation_id: conv.id,
      task_id: conv.task_id ?? undefined,
      action: '本人接手，分身停止代聊',
      reason: '你选择本人接手，接下来由你自己聊',
      ...(Object.keys(detail).length > 0 ? { detail } : {}),
    })
    return { conversationId: conv.id, verdict, summary, summaryFailed: error !== null }
  } finally {
    running.delete(key)
  }
}

export function createHandoffApi(deps: HandoffDeps): HandoffApi {
  // 同一個人同時只跑一次接手（連按兩次、兩個分頁）；跨程序靠 switchToHuman 的條件更新
  const running = new Set<string>()
  return { takeOver: (id, userId) => takeOver(deps, running, id, userId) }
}
