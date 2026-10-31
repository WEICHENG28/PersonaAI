// C7 通知鈴鐺的後端（docs/07C C7）。擁有者：C。
// GET /api/notifications：自己最近的通知，每種只回鈴鐺要顯示的欄位（friend_report 的報告內容、任何分數都不回）。
// POST /api/notifications/:id/read：「找到合适的人」點開後設為已讀。friend_report 由 A 的「下次見面」說完才設已讀，
// request_human 回應時就設已讀，所以這兩種不能從這裡設。
import { z } from 'zod'
import type { AnomalyChoice } from './anomaly'
import { ChatRoomError } from './chatRoom'
import type { HumanResponse, NotificationRow, NotificationType, RequestHumanStore } from './requestHuman'

/** 鈴鐺最多列幾則。 */
export const NOTIFICATION_LIST_LIMIT = 20

export interface NotificationView {
  id: string
  type: NotificationType
  createdAt: string
  read: boolean
  response: HumanResponse | null
  /** match、request_human、anomaly 才有。 */
  conversationId: string | null
  /** match 是對方名字、request_human 是請求的人。 */
  name: string | null
  /** match 才可能是 true。 */
  mutual: boolean
  /** anomaly 才有：對方的具體行為摘要（只給被提醒的人看）。 */
  evidence: string[]
  /** anomaly 才有：用戶選了什麼（還沒選是 null）。 */
  choice: AnomalyChoice | null
}

export interface NotificationStore extends Pick<RequestHumanStore, 'getNotification' | 'markRead'> {
  /** 這位用戶的通知，新的在前。 */
  listNotifications(userId: string, limit: number): Promise<NotificationRow[]>
  /** anomaly_flags 的 user_choice，依 flag id；只查 notify_user_id 是這位用戶的。 */
  getAnomalyChoices(userId: string, flagIds: string[]): Promise<Record<string, AnomalyChoice | null>>
}

export interface NotificationDeps {
  store: NotificationStore
  now(): Date
}

export interface NotificationApi {
  list(userId: string): Promise<NotificationView[]>
  markRead(notificationId: string, userId: string): Promise<void>
}

// payload 是別條線寫的 jsonb（match 由 B、request_human 由 B／C），欄位不對就當沒有
const payloadSchema = z.object({
  conversationId: z.string().min(1).optional().catch(undefined),
  targetName: z.string().optional().catch(undefined),
  fromName: z.string().optional().catch(undefined),
  mutual: z.boolean().optional().catch(undefined),
  flagId: z.string().optional().catch(undefined),
  evidence: z.array(z.string()).optional().catch(undefined),
})

const READABLE_TYPES: readonly NotificationType[] = ['match']

/** anomaly 通知對應的 flag id（payload 裡）；沒有回 null。 */
export function flagIdOf(row: NotificationRow): string | null {
  if (row.type !== 'anomaly') return null
  const p = payloadSchema.safeParse(row.payload ?? {})
  return (p.success && p.data.flagId) || null
}

/** 一列通知 → 鈴鐺要的欄位；friend_report 的報告內容不回（只顯示「阿澈有事想跟你说」）。 */
export function toNotificationView(row: NotificationRow, choice: AnomalyChoice | null = null): NotificationView {
  const p = payloadSchema.safeParse(row.payload ?? {})
  const payload = p.success ? p.data : {}
  const base = {
    id: row.id,
    type: row.type,
    createdAt: row.created_at,
    read: row.read_at !== null,
    response: row.response,
    evidence: [] as string[],
    choice: null as AnomalyChoice | null,
  }
  if (row.type === 'match') {
    return { ...base, conversationId: payload.conversationId ?? null, name: payload.targetName ?? null, mutual: payload.mutual === true }
  }
  if (row.type === 'request_human') {
    return { ...base, conversationId: payload.conversationId ?? null, name: payload.fromName ?? null, mutual: false }
  }
  if (row.type === 'anomaly') {
    const evidence = (payload.evidence ?? []).filter((e) => typeof e === 'string' && e.trim() !== '').slice(0, 3)
    return { ...base, conversationId: payload.conversationId ?? null, name: null, mutual: false, evidence, choice }
  }
  return { ...base, conversationId: null, name: null, mutual: false }
}

async function markRead(deps: NotificationDeps, notificationId: string, userId: string): Promise<void> {
  const note = await deps.store.getNotification(notificationId)
  if (!note || note.user_id !== userId) throw new ChatRoomError('找不到这则通知', 404)
  if (!READABLE_TYPES.includes(note.type)) throw new ChatRoomError('这则通知不能直接设为已读', 400)
  if (note.read_at) return
  await deps.store.markRead(notificationId, userId, deps.now().toISOString())
}

async function list(deps: NotificationDeps, userId: string): Promise<NotificationView[]> {
  const rows = await deps.store.listNotifications(userId, NOTIFICATION_LIST_LIMIT)
  const flagIds = rows.map(flagIdOf).filter((id): id is string => id !== null)
  const choices = flagIds.length > 0 ? await deps.store.getAnomalyChoices(userId, flagIds) : {}
  return rows.map((row) => {
    const flagId = flagIdOf(row)
    return toNotificationView(row, flagId ? (choices[flagId] ?? null) : null)
  })
}

export function createNotificationApi(deps: NotificationDeps): NotificationApi {
  return {
    list: (userId) => list(deps, userId),
    markRead: (id, userId) => markRead(deps, id, userId),
  }
}
