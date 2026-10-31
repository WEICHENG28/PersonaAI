// C8 言行異常提醒（docs/07C C8、02 F9）。擁有者：C。
// 本人送出訊息後：他在這段對話的本人訊息數 ≥ ANOMALY_MIN_MESSAGES 且是 ANOMALY_CHECK_EVERY 的倍數，就跑 Prompt 9（reason）。
// is_extreme 才寫入 anomaly_flags、通知「對方」（type anomaly），只提醒當事人，不公開、不打分數。
// 用戶在通知上的選擇寫回 user_choice：end → 結束對話；report → 只記錄；continue → 只記錄。
// 外部依賴（資料庫、A 的檔案、LLM、日誌、結束對話）都放在 AnomalyDeps，測試可以換成假的。
import { z } from 'zod'
import type { AgentLogInput, ShareableProfile, StyleProfile } from '../../shared/types'
import type { LlmJsonOptions } from '../lib/llm'
import {
  anomalyResultSchema,
  anomalyUserMessage,
  renderAnomalySystem,
  type AnomalyResult,
  type AnomalyType,
} from '../prompts/09_anomaly'
import { ChatRoomError, type ChatRoomStore } from './chatRoom'
import type { NotificationRow } from './requestHuman'

/** 帶入 Prompt 9 的本人訊息最多幾則（取最新的）。 */
export const ANOMALY_MESSAGES_LIMIT = 30

export type AnomalyChoice = 'continue' | 'end' | 'report'
export const anomalyChoiceSchema = z.enum(['continue', 'end', 'report'])

const CHOICE_TEXT: Record<AnomalyChoice, string> = { continue: '继续聊', end: '结束对话', report: '检举' }

export interface NewAnomalyFlag {
  conversation_id: string
  flagged_user_id: string
  notify_user_id: string
  anomaly_type: AnomalyType
  evidence: string[]
}

export interface AnomalyFlagRow {
  id: string
  conversation_id: string
  notify_user_id: string
  user_choice: AnomalyChoice | null
}

export interface AnomalyPayload {
  conversationId: string
  flagId: string
  evidence: string[]
}

export interface AnomalyStore extends Pick<ChatRoomStore, 'getConversation'> {
  /** 這位用戶在這段對話的本人訊息（is_ai = false），由舊到新。 */
  listHumanMessages(conversationId: string, userId: string): Promise<string[]>
  /** 這段對話是否已經標記過這位用戶（標過就不再重複提醒）。 */
  hasFlag(conversationId: string, flaggedUserId: string): Promise<boolean>
  insertFlag(row: NewAnomalyFlag): Promise<{ id: string }>
  insertAnomalyNotification(userId: string, payload: AnomalyPayload): Promise<{ id: string }>
  getNotification(id: string): Promise<NotificationRow | null>
  getFlag(id: string): Promise<AnomalyFlagRow | null>
  /** 只在還沒選過時寫入；回傳有沒有寫到。 */
  saveChoice(flagId: string, choice: AnomalyChoice): Promise<boolean>
  /** 動作失敗時改回沒選過。 */
  clearChoice(flagId: string): Promise<void>
  markRead(id: string, userId: string, readAt: string): Promise<void>
  /** 把通知改回未讀（同 requestHuman 的 clearResponse）。 */
  clearResponse(id: string): Promise<void>
}

export interface AnomalyDeps {
  store: AnomalyStore
  getShareableProfile(userId: string): Promise<ShareableProfile | null>
  getStyleProfile(userId: string): Promise<StyleProfile | null>
  llmJson<T>(opts: LlmJsonOptions<T>): Promise<T>
  writeLog(entry: AgentLogInput): Promise<void>
  /** C3 結束對話；closerUserId 是分身時由他收尾。 */
  endConversation(conversationId: string, closerUserId: string): Promise<void>
  now(): Date
  minMessages: number
  checkEvery: number
}

export type CheckOutcome = 'skipped' | 'normal' | 'flagged'

export interface AnomalyApi {
  /** 本人送出訊息後呼叫；不丟錯（失敗只記錄），不擋聊天。 */
  checkAfterHumanMessage(conversationId: string, userId: string): Promise<CheckOutcome>
  respond(notificationId: string, userId: string, choice: AnomalyChoice): Promise<{ choice: AnomalyChoice; conversationId: string }>
}

/** 本人訊息數到門檻、而且是間隔的倍數才檢查（例：15、20、25…）。 */
export function shouldCheck(count: number, minMessages: number, checkEvery: number): boolean {
  return count >= minMessages && checkEvery > 0 && count % checkEvery === 0
}

/** is_extreme 但 type 不在清單裡 → 不算（anomaly_flags 的 type 不能是空的）。 */
export function isFlagged(result: AnomalyResult): result is AnomalyResult & { type: AnomalyType } {
  return result.is_extreme && result.type !== null
}

interface CheckTarget {
  conversationId: string
  taskId: string | null
  flaggedUserId: string
  notifyUserId: string
}

async function loadTarget(deps: AnomalyDeps, conversationId: string, userId: string): Promise<CheckTarget | null> {
  const conv = await deps.store.getConversation(conversationId)
  if (!conv || conv.status === 'ended') return null
  const isA = conv.side_a === userId
  if (!isA && conv.side_b !== userId) return null
  if ((isA ? conv.side_a_controller : conv.side_b_controller) !== 'human') return null
  return { conversationId: conv.id, taskId: conv.task_id, flaggedUserId: userId, notifyUserId: isA ? conv.side_b : conv.side_a }
}

async function flag(deps: AnomalyDeps, target: CheckTarget, result: AnomalyResult & { type: AnomalyType }): Promise<void> {
  const { id: flagId } = await deps.store.insertFlag({
    conversation_id: target.conversationId,
    flagged_user_id: target.flaggedUserId,
    notify_user_id: target.notifyUserId,
    anomaly_type: result.type,
    evidence: result.evidence,
  })
  await deps.store.insertAnomalyNotification(target.notifyUserId, {
    conversationId: target.conversationId,
    flagId,
    evidence: result.evidence,
  })
}

async function check(deps: AnomalyDeps, conversationId: string, userId: string): Promise<CheckOutcome> {
  const target = await loadTarget(deps, conversationId, userId)
  if (!target) return 'skipped'
  const messages = await deps.store.listHumanMessages(target.conversationId, userId)
  if (!shouldCheck(messages.length, deps.minMessages, deps.checkEvery)) return 'skipped'
  if (await deps.store.hasFlag(target.conversationId, userId)) return 'skipped'
  const [shareable, style] = await Promise.all([deps.getShareableProfile(userId), deps.getStyleProfile(userId)])
  // 沒有對外描述就沒有東西可以比，不判斷
  if (!shareable) return 'skipped'

  const result = await deps.llmJson({
    role: 'reason',
    system: renderAnomalySystem(shareable, style),
    messages: [{ role: 'user', content: anomalyUserMessage(messages.slice(-ANOMALY_MESSAGES_LIMIT)) }],
    temperature: 0,
    schema: anomalyResultSchema,
  })
  const flagged = isFlagged(result)
  if (flagged) await flag(deps, target, result)
  // 日誌寫給被提醒的人（受保護的一方）；被檢查的人看不到，不公開貼標籤
  await deps.writeLog({
    user_id: target.notifyUserId,
    agent: 'guard',
    conversation_id: target.conversationId,
    task_id: target.taskId ?? undefined,
    action: flagged ? '提醒：对方的言行和描述差很多' : '检查对方言行：没有异常',
    reason: flagged ? '对方本人的说话方式和 TA 的描述极度不一致' : `对方本人已经说了 ${messages.length} 则，定期检查`,
    ...(flagged ? { detail: { anomaly_type: result.type } } : {}),
  })
  return flagged ? 'flagged' : 'normal'
}

async function checkAfterHumanMessage(deps: AnomalyDeps, conversationId: string, userId: string): Promise<CheckOutcome> {
  try {
    return await check(deps, conversationId, userId)
  } catch (err) {
    console.error('[twin] 言行异常检查失败', conversationId, err)
    return 'skipped'
  }
}

const payloadSchema = z.object({ conversationId: z.string().min(1), flagId: z.string().min(1) })

/** 讀通知與標記，確認是自己的、是言行異常、還沒選過。 */
async function loadAnomaly(deps: AnomalyDeps, notificationId: string, userId: string) {
  const note = await deps.store.getNotification(notificationId)
  if (!note || note.user_id !== userId) throw new ChatRoomError('找不到这则通知', 404)
  if (note.type !== 'anomaly') throw new ChatRoomError('这则通知不能这样回应', 400)
  const payload = payloadSchema.safeParse(note.payload)
  if (!payload.success) throw new ChatRoomError('找不到这则提醒', 404)
  const flagRow = await deps.store.getFlag(payload.data.flagId)
  if (!flagRow || flagRow.notify_user_id !== userId) throw new ChatRoomError('找不到这则提醒', 404)
  if (flagRow.user_choice) throw new ChatRoomError('你已经选过了', 409)
  return { flagRow, conversationId: flagRow.conversation_id }
}

async function respond(deps: AnomalyDeps, notificationId: string, userId: string, choice: AnomalyChoice) {
  const { flagRow, conversationId } = await loadAnomaly(deps, notificationId, userId)
  // 先記下選擇再動作：連按兩次只結束一次
  if (!(await deps.store.saveChoice(flagRow.id, choice))) throw new ChatRoomError('你已经选过了', 409)
  await deps.store.markRead(notificationId, userId, deps.now().toISOString())
  if (choice === 'end') {
    try {
      await deps.endConversation(conversationId, userId)
    } catch (err) {
      console.error('[twin] 言行异常提醒：结束对话失败，改回没选过', conversationId, err)
      await Promise.allSettled([deps.store.clearChoice(flagRow.id), deps.store.clearResponse(notificationId)])
      throw new ChatRoomError('刚才没处理成功，请再选一次', 503)
    }
  }
  await deps.writeLog({
    user_id: userId,
    agent: 'guard',
    conversation_id: conversationId,
    action: `言行异常提醒：选择${CHOICE_TEXT[choice]}`,
    reason: choice === 'report' ? '已记录检举，目前不做审核流程' : `你选择了「${CHOICE_TEXT[choice]}」`,
    detail: { flag_id: flagRow.id, choice },
  })
  return { choice, conversationId }
}

export function createAnomalyApi(deps: AnomalyDeps): AnomalyApi {
  return {
    checkAfterHumanMessage: (id, userId) => checkAfterHumanMessage(deps, id, userId),
    respond: (id, userId, choice) => respond(deps, id, userId, choice),
  }
}
