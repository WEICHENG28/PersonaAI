/**
 * 阿澈「這一輪要說什麼」的純函式（E-1）：組 prompt、呼叫模型，不碰資料庫。
 * chat.ts 負責讀寫資料庫，評測工具（scripts/eval）直接呼叫這裡，兩邊用同一套生成邏輯。
 * N-1：改成真正的 user／assistant 多輪訊息（原本整段對話壓成一則 user 訊息）。
 */
import { CONFIG } from '../lib/config.js'
import { llmJson, type LlmMessage } from '../lib/llm/index.js'
import type { LlmMetric } from '../lib/llm/metrics.js'
import { NUDGE_USER_MESSAGE, friendReplySchema, renderFriendSystem, type FriendReply } from '../prompts/01_friend.js'
import { toAlternatingTurns } from '../lib/llm/turns.js'

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

/** 評測、日誌用的純文字版對話（不是給模型的格式）。 */
export function historyText(history: FriendHistoryItem[]): string {
  return history.map(m => `${m.role === 'user' ? '用户' : '阿澈'}：${m.content}`).join('\n')
}

/** 一則歷史訊息在模型眼中的樣子：阿澈說的是 assistant；任務確認卡加標記，模型才知道那是卡片。 */
function toLlmMessage(m: FriendHistoryItem): LlmMessage {
  if (m.role === 'user') return { role: 'user', content: m.content }
  return { role: 'assistant', content: m.kind === 'task_card' ? `[任务确认卡] ${m.content}` : m.content }
}

/**
 * 組這一輪的 prompt（N-1）：真正的多輪訊息，阿澈說過的話是 assistant。
 * 最後一則一定是 user：一般是用戶這句；nudge 是固定文案「（用户有一阵子没回消息了）」。
 */
export function buildFriendPrompt(ctx: FriendTurnContext): FriendPrompt {
  const system = renderFriendSystem({
    lifeState: ctx.lifeState,
    eventText: ctx.eventText,
    recallMemory: ctx.recallMemory,
    memories: ctx.memories,
    crisisResource: CONFIG.CRISIS_RESOURCE,
  })
  const items = ctx.history.map(toLlmMessage)
  const last = ctx.history.at(-1)
  if (ctx.isNudge) items.push({ role: 'user', content: NUDGE_USER_MESSAGE })
  else if (!(last?.role === 'user' && last.content.trim() === ctx.userText.trim())) items.push({ role: 'user', content: ctx.userText })
  return { system, messages: toAlternatingTurns(items) }
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
