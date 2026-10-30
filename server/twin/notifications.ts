// C7 通知鈴鐺的後端（docs/07C C7）。擁有者：C。
// GET /api/notifications：自己最近的通知，每種只回鈴鐺要顯示的欄位（friend_report 的報告內容、任何分數都不回）。
// POST /api/notifications/:id/read：「找到合适的人」點開後設為已讀。friend_report 由 A 的「下次見面」說完才設已讀，
// request_human 回應時就設已讀，所以這兩種不能從這裡設。
import { z } from 'zod'
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
}

export interface NotificationStore extends Pick<RequestHumanStore, 'getNotification' | 'markRead'> {
  /** 這位用戶的通知，新的在前。 */
  listNotifications(userId: string, limit: number): Promise<NotificationRow[]>
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
})

const READABLE_TYPES: readonly NotificationType[] = ['match']

/** 一列通知 → 鈴鐺要的欄位；friend_report 的報告內容不回（只顯示「阿澈有事想跟你说」）。 */
export function toNotificationView(row: NotificationRow): NotificationView {
  const p = payloadSchema.safeParse(row.payload ?? {})
  const payload = p.success ? p.data : {}
  const base = { id: row.id, type: row.type, createdAt: row.created_at, read: row.read_at !== null, response: row.response }
  if (row.type === 'match') {
    return { ...base, conversationId: payload.conversationId ?? null, name: payload.targetName ?? null, mutual: payload.mutual === true }
  }
  if (row.type === 'request_human') {
    return { ...base, conversationId: payload.conversationId ?? null, name: payload.fromName ?? null, mutual: false }
  }
  if (row.type === 'anomaly') {
    return { ...base, conversationId: payload.conversationId ?? null, name: null, mutual: false }
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

export function createNotificationApi(deps: NotificationDeps): NotificationApi {
  return {
    list: async (userId) => (await deps.store.listNotifications(userId, NOTIFICATION_LIST_LIMIT)).map(toNotificationView),
    markRead: (id, userId) => markRead(deps, id, userId),
  }
}
