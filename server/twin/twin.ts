// C1 分身回覆（docs/07C C1）。擁有者：C。
// twinReply：用說話者的對外檔案＋說話風格（A 的 contracts，不拿 agent_profile）產生一則訊息，
// 過隱私守門後寫入 messages（is_ai = true），並寫工作日誌。
// 外部依賴（資料庫、A 的檔案、守門、LLM、日誌）都放在 TwinDeps，測試和開發腳本可以換成假的。
import type {
  AgentLogInput,
  ChatMessage,
  Controller,
  GuardResult,
  ShareableProfile,
  StyleProfile,
} from '../../shared/types.js'
import { getShareableProfile, getStyleProfile } from '../contracts/friend.js'
import { guardText } from './guard.js'
import { llmJson, type LlmJsonOptions } from '../lib/llm/index.js'
import { writeLog } from '../lib/log.js'
import { CONFIG } from '../lib/config.js'
import { renderTwinSystem, twinReplySchema, type TwinReply } from '../prompts/05_twin.js'
import { supabaseTwinStore } from './store.js'
import { askedQuestions, dropRepeatedSentences, repeatProblem } from './repeat.js'

/**
 * 帶入 Prompt 的最近訊息數：涵蓋整場代聊（每輪雙方各一則），分身才記得前面說過什麼、問過什麼。
 * 07C C1 原本寫 12 則（6 輪），實跑時第 7 輪後開始重複前面的句子。
 */
export const TWIN_RECENT_LIMIT = CONFIG.MAX_ROUNDS * 2
const TWIN_TEMPERATURE = 0.8
/** 對話沒設定開場話題時給分身的提示。 */
const OPENING_FALLBACK = '从你的兴趣聊起'
/** A 還沒產生說話風格時的預設值。 */
const DEFAULT_STYLE: StyleProfile = { sentence_length: 'medium', tone: '自然、友善', emoji_level: 1, formality: 'casual' }

export class TwinError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TwinError'
  }
}

/** conversations.status（docs/07 第 4 節）。 */
export type ConversationStatus = 'active' | 'waiting_human' | 'ended'

export interface TwinConversation {
  id: string
  status: ConversationStatus
  side_a: string
  side_b: string
  side_a_controller: Controller
  side_b_controller: Controller
  opening_topic: string | null
  task_id: string | null
}

export interface TwinMessageRow {
  sender_id: string
  content: string
  created_at: string
}

export interface NewTwinMessage {
  conversation_id: string
  sender_id: string
  is_ai: true
  guard_rewritten: boolean
  content: string
}

export interface TwinStore {
  getConversation(id: string): Promise<TwinConversation | null>
  getDisplayName(userId: string): Promise<string>
  /** 依時間由舊到新，最多 limit 則（取最新的那幾則）。 */
  getRecentMessages(conversationId: string, limit: number): Promise<TwinMessageRow[]>
  insertMessage(row: NewTwinMessage): Promise<ChatMessage>
}

export interface TwinDeps {
  store: TwinStore
  getShareableProfile(userId: string): Promise<ShareableProfile | null>
  getStyleProfile(userId: string): Promise<StyleProfile | null>
  guardText(text: string, ownerUserId: string): Promise<GuardResult>
  llmJson<T>(opts: LlmJsonOptions<T>): Promise<T>
  writeLog(entry: AgentLogInput): Promise<void>
}

export interface TwinReplyOptions {
  /** 額外規則，例如 C3 收尾時的「这是最后一则消息，请礼貌地结束对话」。 */
  extraInstruction?: string
}

export type TwinReplyFn = (
  conversationId: string,
  speakerUserId: string,
  options?: TwinReplyOptions,
) => Promise<ChatMessage>

/** 給模型的「輪到你說話」；有額外規則時也放進來，只放在 system 最後一條時模型常忽略（C3 收尾實測）。 */
export function turnMessage(extraInstruction?: string): string {
  const extra = extraInstruction?.trim().replace(/^-\s*/, '')
  return extra ? `轮到你说下一则消息了。这一则特别注意：${extra}\n只输出 JSON。` : '轮到你说下一则消息了，只输出 JSON。'
}

/** 把最近訊息排成「我：…／对方：…」。 */
export function formatRecentMessages(messages: readonly TwinMessageRow[], speakerUserId: string): string {
  if (messages.length === 0) return '（还没有消息，你是第一个说话的人）'
  return messages.map((m) => `${m.sender_id === speakerUserId ? '我' : '对方'}：${m.content}`).join('\n')
}

function controllerOf(conv: TwinConversation, userId: string): Controller | null {
  if (userId === conv.side_a) return conv.side_a_controller
  if (userId === conv.side_b) return conv.side_b_controller
  return null
}

async function loadConversation(store: TwinStore, conversationId: string, speakerUserId: string): Promise<TwinConversation> {
  const conv = await store.getConversation(conversationId)
  if (!conv) throw new TwinError('找不到这段对话')
  // waiting_human 不擋：C3 收尾、C7「本人晚点会上线」都要在等待本人時讓分身說話
  if (conv.status === 'ended') throw new TwinError('这段对话已经结束')
  const controller = controllerOf(conv, speakerUserId)
  if (!controller) throw new TwinError('发言者不是这段对话的成员')
  if (controller !== 'twin') throw new TwinError('这一方由本人在聊，分身不发言')
  return conv
}

/**
 * 一般發言不寫日誌（每句一筆會把工作日誌洗版）。只有「要問本人」寫在這裡；
 * 其他有意義的事已經由別處寫：開場＝C3「开始代聊」、守門改寫＝C2「改写分身消息」、
 * 失敗＝C3「开场失败」／C4「分身没有回上」／B9「跳过：代聊失败」。
 */
async function writeAskHumanLog(deps: TwinDeps, conv: TwinConversation, speakerUserId: string, messageId: string): Promise<void> {
  await deps.writeLog({
    user_id: speakerUserId,
    agent: 'twin',
    conversation_id: conv.id,
    task_id: conv.task_id ?? undefined,
    action: '需要问本人',
    reason: '对方问到个人信息或要约定时间地点，回复要问本人',
    detail: { message_id: messageId },
  })
}

/** 產生一則；整則或其中一句和自己說過的幾乎一樣、或一直重複同一個口頭禪，就帶著「換個新內容」再產生一次；第二次還重複的句子拿掉。 */
async function generateReply(
  deps: TwinDeps,
  system: string,
  ownSaid: readonly string[],
  extraInstruction?: string,
): Promise<TwinReply> {
  const ask = (extra?: string) =>
    deps.llmJson({
      role: 'chat',
      system,
      messages: [{ role: 'user', content: turnMessage(extra) }],
      temperature: TWIN_TEMPERATURE,
      schema: twinReplySchema,
    })
  const first = await ask(extraInstruction)
  const problem = repeatProblem(first.message, ownSaid)
  if (!problem) return first
  const second = await ask([extraInstruction?.trim().replace(/^-\s*/, ''), problem].filter(Boolean).join('；'))
  // 第二次還重複某一句（實測：同一個問題問兩次）：拿掉那一句；整則都是重複就照用，不再呼叫模型
  return { ...second, message: dropRepeatedSentences(second.message, ownSaid) }
}

export function createTwinReply(deps: TwinDeps): TwinReplyFn {
  return async function twinReply(conversationId, speakerUserId, options = {}) {
    const conv = await loadConversation(deps.store, conversationId, speakerUserId)

    // 1. 說話者的對外檔案與風格（不取 agent_profile）
    const [shareable, style, name, recent] = await Promise.all([
      deps.getShareableProfile(speakerUserId),
      deps.getStyleProfile(speakerUserId),
      deps.store.getDisplayName(speakerUserId),
      deps.store.getRecentMessages(conversationId, TWIN_RECENT_LIMIT),
    ])
    if (!shareable) throw new TwinError('这位用户还没有确认对外档案，分身暂时不能代聊')

    // 2～3. 開場話題＋整場的訊息 → Prompt 5
    const openingTopic = conv.opening_topic?.trim() || OPENING_FALLBACK
    const ownSaid = recent.filter((m) => m.sender_id === speakerUserId).map((m) => m.content)
    const system = renderTwinSystem({
      name,
      shareable,
      style: style ?? DEFAULT_STYLE,
      openingTopic,
      recentMessages: formatRecentMessages(recent, speakerUserId),
      askedQuestions: askedQuestions(ownSaid),
      extraInstruction: options.extraInstruction,
    })
    const reply = await generateReply(deps, system, ownSaid, options.extraInstruction)

    // 4. 隱私守門 → 寫入 messages
    const guarded = await deps.guardText(reply.message, speakerUserId)
    const saved = await deps.store.insertMessage({
      conversation_id: conversationId,
      sender_id: speakerUserId,
      is_ai: true,
      guard_rewritten: !guarded.ok,
      content: guarded.text,
    })

    // 5～6. 工作日誌：只有要問本人時寫
    if (reply.ask_human) await writeAskHumanLog(deps, conv, speakerUserId, saved.id)

    const { id, conversation_id, sender_id, is_ai, content, created_at } = saved
    return { id, conversation_id, sender_id, is_ai, content, created_at }
  }
}

/** 預設依賴：Supabase、A 的 contracts、C 的 guardText（C2）、B 的 llm／log。 */
export function defaultTwinDeps(): TwinDeps {
  return { store: supabaseTwinStore(), getShareableProfile, getStyleProfile, guardText, llmJson, writeLog }
}

/** C3／C4 呼叫這個。 */
export const twinReply: TwinReplyFn = (conversationId, speakerUserId, options) =>
  createTwinReply(defaultTwinDeps())(conversationId, speakerUserId, options)
