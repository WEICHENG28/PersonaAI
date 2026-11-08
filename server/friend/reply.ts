/**
 * 阿澈「這一輪要說什麼」的純函式（E-1）：組 prompt、呼叫模型，不碰資料庫。
 * chat.ts 負責讀寫資料庫，評測工具（scripts/eval）直接呼叫這裡，兩邊用同一套生成邏輯。
 * 本任務只搬家、不改行為：prompt 仍是「整段對話壓成一則 user 訊息」的舊格式（N-1 才改成多輪）。
 */
import { CONFIG } from '../lib/config.js'
import { llmJson, type LlmMessage } from '../lib/llm/index.js'
import type { LlmMetric } from '../lib/llm/metrics.js'
import { friendReplySchema, renderFriendSystem, type FriendReply } from '../prompts/01_friend.js'

export interface FriendHistoryItem {
  role: 'user' | 'friend'
  kind: string
  content: string
  meta?: Record<string, unknown> | null
  created_at?: string
}

export interface FriendTurnContext {
  /** 阿澈此刻的狀態，例如「有点累；在整理照片」。 */
  lifeState: string
  /** 這次可以分享的事件；沒有就是 null。 */
  eventText: string | null
  /** 這次可以問起的記憶；沒有就是 null。 */
  recallMemory: string | null
  /** 已整理好的記憶清單文字（每行「- …」，沒有時是「（还没有长期记忆）」）。 */
  memories: string
  /** 時間正序的最近對話（已含這一則用戶訊息）。 */
  history: FriendHistoryItem[]
  isNudge: boolean
  /** 用戶這一則說的話（nudge 時是佔位字）。 */
  userText: string
}

export interface FriendPrompt {
  system: string
  messages: LlmMessage[]
}

const NUDGE_PREFIX = '[mode: nudge] 用户停止回复了一段时间，现在请阿澈主动接话，分享一件和最近话题相关的事或问一个轻松的问题。上下文：\n'

export function historyText(history: FriendHistoryItem[]): string {
  return history.map(m => `${m.role === 'user' ? '用户' : '阿澈'}：${m.content}`).join('\n')
}

/** 組這一輪的 prompt（目前的壓平格式：整段對話放進一則 user 訊息）。 */
export function buildFriendPrompt(ctx: FriendTurnContext): FriendPrompt {
  const system = renderFriendSystem({
    lifeState: ctx.lifeState,
    eventText: ctx.eventText ?? '无',
    recallMemory: ctx.recallMemory ?? '无',
    memories: ctx.memories,
    crisisResource: CONFIG.CRISIS_RESOURCE,
  })
  const recentText = historyText(ctx.history)
  const content = ctx.isNudge ? `${NUDGE_PREFIX}${recentText || '（还没有聊天记录）'}` : recentText || ctx.userText
  return { system, messages: [{ role: 'user', content }] }
}

export interface GenerateOptions {
  onMetric?: (metric: LlmMetric) => void
  timeoutMs?: number
  maxAttempts?: number
}

/** 呼叫模型產生阿澈的回覆（前景預算：阿澈在等，不能拖太久）。 */
export async function generateFriendReply(ctx: FriendTurnContext, opts: GenerateOptions = {}): Promise<FriendReply> {
  const { system, messages } = buildFriendPrompt(ctx)
  return llmJson({
    role: 'chat',
    tag: 'friend.reply',
    timeoutMs: opts.timeoutMs ?? CONFIG.LLM_FG_TIMEOUT_MS,
    maxAttempts: opts.maxAttempts ?? CONFIG.LLM_FG_MAX_RETRIES + 1,
    onMetric: opts.onMetric,
    system,
    messages,
    temperature: 0.8,
    schema: friendReplySchema,
  })
}
