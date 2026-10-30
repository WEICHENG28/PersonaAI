// C3 代聊函式（docs/07C C3、docs/07 第 6 節）。擁有者：C。
// 開始代聊、跑輪數、對話紀錄、結束、等待本人。server/contracts/twin.ts 呼叫這裡。
// 一輪＝雙方分身各說一次，從「上一則發言者的對方」開始輪流；哪方是本人就跳過該方。
// 外部依賴（資料庫、twinReply、日誌、時間）都放在 ConversationDeps，測試可以換成假的。
import { z } from 'zod'
import type { AgentLogInput, ChatMessage, Controller, StartConversationInput } from '../../shared/types'
import { CONFIG } from '../lib/config'
import { writeLog } from '../lib/log'
import { supabaseConversationStore } from './store'
import { TwinError, twinReply, type ConversationStatus, type TwinConversation, type TwinReplyFn } from './twin'

/** endConversation 收尾時給分身的額外規則（Prompt 5 的 extra_instruction）。 */
export const CLOSING_INSTRUCTION =
  '- 这是你在这段对话里的最后一则消息：简短、礼貌地道别，不要再提问，不要约下次见面，也不要说你们不合适或评价对方。'

/** 開場話題最多保留幾個字。 */
const OPENING_TOPIC_MAX = 200

const END_REASON_TEXT: Record<EndReason, string> = {
  unsuitable: '判断不太合适，礼貌结束',
  done: '任务完成，结束代聊',
  declined: '对方婉拒，礼貌结束',
}

export type EndReason = 'unsuitable' | 'done' | 'declined'

export interface ConversationRow extends TwinConversation {
  round_count: number
  ended_at?: string | null
}

export interface NewConversationRow {
  side_a: string
  side_b: string
  side_a_controller: Controller
  side_b_controller: Controller
  origin: 'auto' | 'manual'
  task_id: string | null
  opening_topic: string | null
}

export interface ConversationPatch {
  status?: ConversationStatus
  round_count?: number
  ended_at?: string
}

export interface ConversationStore {
  createConversation(row: NewConversationRow): Promise<ConversationRow>
  getConversation(id: string): Promise<ConversationRow | null>
  updateConversation(id: string, patch: ConversationPatch): Promise<void>
  /** 只用在開場失敗、對話還沒有訊息時。 */
  deleteConversation(id: string): Promise<void>
  /** 最新一則訊息的發言者；還沒有訊息時回 null。 */
  getLastSenderId(conversationId: string): Promise<string | null>
  listMessages(conversationId: string): Promise<ChatMessage[]>
}

export interface ConversationDeps {
  store: ConversationStore
  twinReply: TwinReplyFn
  writeLog(entry: AgentLogInput): Promise<void>
  now(): Date
  maxRounds: number
}

export interface ConversationApi {
  startConversation(input: StartConversationInput): Promise<{ conversationId: string }>
  runTwinRounds(conversationId: string, rounds: number): Promise<{ roundCount: number; ended: boolean }>
  getTranscript(conversationId: string): Promise<ChatMessage[]>
  endConversation(conversationId: string, reason: EndReason): Promise<void>
  markWaitingHuman(conversationId: string): Promise<void>
}

const startInputSchema = z
  .object({
    aUserId: z.string().trim().min(1),
    bUserId: z.string().trim().min(1),
    aController: z.enum(['human', 'twin']),
    origin: z.enum(['auto', 'manual']),
    taskId: z.string().trim().min(1).optional(),
    // 開場話題來自 B 的規劃器（LLM 輸出），太長就截斷，不要因此整場開不了
    openingTopic: z
      .string()
      .trim()
      .optional()
      .transform((t) => t?.slice(0, OPENING_TOPIC_MAX)),
  })
  .refine((v) => v.aUserId !== v.bUserId, { message: '不能和自己开始对话' })

type StartInput = z.infer<typeof startInputSchema>

/** 這一輪要說話的分身，依序：從上一則發言者的對方開始，跳過本人在聊的一方。 */
export function twinSpeakersInOrder(conv: TwinConversation, lastSenderId: string | null): string[] {
  const sides: { id: string; controller: Controller }[] = [
    { id: conv.side_a, controller: conv.side_a_controller },
    { id: conv.side_b, controller: conv.side_b_controller },
  ]
  const ordered = lastSenderId === conv.side_a ? [...sides].reverse() : sides
  return ordered.filter((s) => s.controller === 'twin').map((s) => s.id)
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function baseLog(conv: ConversationRow): Pick<AgentLogInput, 'user_id' | 'agent' | 'conversation_id' | 'task_id'> {
  return { user_id: conv.side_a, agent: 'twin', conversation_id: conv.id, task_id: conv.task_id ?? undefined }
}

function startReason(input: StartInput): string {
  if (input.openingTopic) return `开场话题：${input.openingTopic}`
  return input.origin === 'manual' ? '从大厅发起' : '社交 Agent 选中的对象'
}

async function requireConversation(deps: ConversationDeps, id: string): Promise<ConversationRow> {
  const conv = await deps.store.getConversation(id)
  if (!conv) throw new TwinError('找不到这段对话')
  return conv
}

function isOver(deps: ConversationDeps, conv: ConversationRow): boolean {
  return conv.status !== 'active' || conv.round_count >= deps.maxRounds
}

/**
 * 開場失敗：刪掉剛建立、還沒有訊息的對話（不留下沒人說話的對話，也不佔 B 的每日代聊次數）；
 * 刪不掉才退回設為 ended。都只寫日誌，不蓋掉原本的錯誤。
 */
async function abandon(deps: ConversationDeps, conv: ConversationRow, cause: unknown): Promise<void> {
  const detail: Record<string, unknown> = { error: errorText(cause) }
  try {
    await deps.store.deleteConversation(conv.id)
  } catch (deleteErr) {
    detail.delete_error = errorText(deleteErr)
    try {
      await deps.store.updateConversation(conv.id, { status: 'ended', ended_at: deps.now().toISOString() })
    } catch (endErr) {
      detail.end_error = errorText(endErr)
    }
  }
  await deps.writeLog({ ...baseLog(conv), action: '开场失败，取消这场代聊', reason: '分身开场出错', detail })
}

async function startConversation(deps: ConversationDeps, raw: StartConversationInput): Promise<{ conversationId: string }> {
  const parsed = startInputSchema.safeParse(raw)
  if (!parsed.success) throw new TwinError('开始代聊的参数不正确')
  const input = parsed.data
  const conv = await deps.store.createConversation({
    side_a: input.aUserId,
    side_b: input.bUserId,
    side_a_controller: input.aController,
    side_b_controller: 'twin',
    origin: input.origin,
    task_id: input.taskId ?? null,
    opening_topic: input.openingTopic || null,
  })
  await deps.writeLog({ ...baseLog(conv), action: '开始代聊', reason: startReason(input) })
  if (input.aController === 'twin') {
    try {
      await deps.twinReply(conv.id, input.aUserId)
    } catch (err) {
      await abandon(deps, conv, err)
      throw err
    }
  }
  return { conversationId: conv.id }
}

async function runTwinRounds(deps: ConversationDeps, conversationId: string, rounds: number): Promise<{ roundCount: number; ended: boolean }> {
  if (!Number.isInteger(rounds) || rounds < 1) throw new TwinError('轮数必须是正整数')
  let conv = await requireConversation(deps, conversationId)
  for (let i = 0; i < rounds && !isOver(deps, conv); i++) {
    const speakers = twinSpeakersInOrder(conv, await deps.store.getLastSenderId(conversationId))
    if (speakers.length === 0) return { roundCount: conv.round_count, ended: false }
    // 一輪內任一次失敗就把錯誤丟出去，由 B 處理；輪數不增加
    for (const speaker of speakers) await deps.twinReply(conversationId, speaker)
    await deps.store.updateConversation(conversationId, { round_count: conv.round_count + 1 })
    // 重讀：輪與輪之間對話可能被本人接手或改成等待本人
    conv = await requireConversation(deps, conversationId)
  }
  return { roundCount: conv.round_count, ended: isOver(deps, conv) }
}

async function getTranscript(deps: ConversationDeps, conversationId: string): Promise<ChatMessage[]> {
  const messages = await deps.store.listMessages(conversationId)
  return [...messages].sort((x, y) => x.created_at.localeCompare(y.created_at))
}

/** 輪到的分身送一則收尾；失敗只寫日誌，不擋結束。 */
async function sendClosing(deps: ConversationDeps, conv: ConversationRow): Promise<void> {
  const [closer] = twinSpeakersInOrder(conv, await deps.store.getLastSenderId(conv.id))
  if (!closer) return
  try {
    await deps.twinReply(conv.id, closer, { extraInstruction: CLOSING_INSTRUCTION })
  } catch (err) {
    await deps.writeLog({ ...baseLog(conv), action: '收尾消息没发出去', reason: '分身收尾时出错，直接结束对话', detail: { error: errorText(err) } })
  }
}

async function endConversation(deps: ConversationDeps, conversationId: string, reason: EndReason): Promise<void> {
  const conv = await requireConversation(deps, conversationId)
  if (conv.status === 'ended') return
  await sendClosing(deps, conv)
  await deps.store.updateConversation(conversationId, { status: 'ended', ended_at: deps.now().toISOString() })
  await deps.writeLog({ ...baseLog(conv), action: '结束代聊', reason: END_REASON_TEXT[reason] })
}

async function markWaitingHuman(deps: ConversationDeps, conversationId: string): Promise<void> {
  const conv = await requireConversation(deps, conversationId)
  if (conv.status === 'ended') throw new TwinError('这段对话已经结束')
  if (conv.status === 'waiting_human') return
  await deps.store.updateConversation(conversationId, { status: 'waiting_human' })
  await deps.writeLog({ ...baseLog(conv), action: '暂停代聊，等本人接手', reason: '判断合适，分身不再自动发言' })
}

export function createConversationApi(deps: ConversationDeps): ConversationApi {
  return {
    startConversation: (input) => startConversation(deps, input),
    runTwinRounds: (id, rounds) => runTwinRounds(deps, id, rounds),
    getTranscript: (id) => getTranscript(deps, id),
    endConversation: (id, reason) => endConversation(deps, id, reason),
    markWaitingHuman: (id) => markWaitingHuman(deps, id),
  }
}

/** 預設依賴：Supabase、C1 的 twinReply、B 的 writeLog／CONFIG。 */
export function defaultConversationDeps(): ConversationDeps {
  return {
    store: supabaseConversationStore(),
    twinReply,
    writeLog,
    now: () => new Date(),
    maxRounds: CONFIG.MAX_ROUNDS,
  }
}
