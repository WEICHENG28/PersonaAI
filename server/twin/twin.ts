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
} from '../../shared/types'
import { getShareableProfile, getStyleProfile } from '../contracts/friend'
import { guardText } from '../contracts/twin'
import { llmJson, type LlmJsonOptions } from '../lib/llm'
import { writeLog } from '../lib/log'
import { renderTwinSystem, twinReplySchema } from '../prompts/05_twin'
import { supabaseTwinStore } from './store'

/** 帶入 Prompt 的最近訊息數（07C C1 第 2 點）。 */
export const TWIN_RECENT_LIMIT = 12
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

export interface TwinConversation {
  id: string
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
  const controller = controllerOf(conv, speakerUserId)
  if (!controller) throw new TwinError('发言者不是这段对话的成员')
  if (controller !== 'twin') throw new TwinError('这一方由本人在聊，分身不发言')
  return conv
}

async function writeReplyLogs(
  deps: TwinDeps,
  log: { conv: TwinConversation; speakerUserId: string; askHuman: boolean; reason: string; detail: Record<string, unknown> },
): Promise<void> {
  const base = {
    user_id: log.speakerUserId,
    agent: 'twin' as const,
    conversation_id: log.conv.id,
    task_id: log.conv.task_id ?? undefined,
  }
  if (log.askHuman) {
    await deps.writeLog({ ...base, action: '需要问本人', reason: '分身遇到档案没写的事，回复要问本人' })
  }
  await deps.writeLog({ ...base, action: '代聊发言', reason: log.reason, detail: log.detail })
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

    // 2～3. 開場話題＋最近 12 則 → Prompt 5
    const openingTopic = conv.opening_topic?.trim() || OPENING_FALLBACK
    const system = renderTwinSystem({
      name,
      shareable,
      style: style ?? DEFAULT_STYLE,
      openingTopic,
      recentMessages: formatRecentMessages(recent, speakerUserId),
      extraInstruction: options.extraInstruction,
    })
    const reply = await deps.llmJson({
      role: 'chat',
      system,
      messages: [{ role: 'user', content: '轮到你说下一则消息了，只输出 JSON。' }],
      temperature: TWIN_TEMPERATURE,
      schema: twinReplySchema,
    })

    // 4. 隱私守門 → 寫入 messages
    const guarded = await deps.guardText(reply.message, speakerUserId)
    const saved = await deps.store.insertMessage({
      conversation_id: conversationId,
      sender_id: speakerUserId,
      is_ai: true,
      guard_rewritten: !guarded.ok,
      content: guarded.text,
    })

    // 5～6. 工作日誌
    await writeReplyLogs(deps, {
      conv,
      speakerUserId,
      askHuman: reply.ask_human,
      reason: recent.length === 0 ? `开场话题：${openingTopic}` : '接住对方上一则消息',
      detail: { message_id: saved.id, guard_rewritten: !guarded.ok },
    })

    const { id, conversation_id, sender_id, is_ai, content, created_at } = saved
    return { id, conversation_id, sender_id, is_ai, content, created_at }
  }
}

/** 預設依賴：Supabase、A 的 contracts、C 的 guardText（C2 前是 stub）、B 的 llm／log。 */
export function defaultTwinDeps(): TwinDeps {
  return { store: supabaseTwinStore(), getShareableProfile, getStyleProfile, guardText, llmJson, writeLog }
}

/** C3／C4 呼叫這個。 */
export const twinReply: TwinReplyFn = (conversationId, speakerUserId, options) =>
  createTwinReply(defaultTwinDeps())(conversationId, speakerUserId, options)
