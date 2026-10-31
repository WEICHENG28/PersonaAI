// C7 請求真人與通知鈴鐺的 Supabase 實作（requestHuman.ts 的 RequestHumanStore、notifications.ts 的 NotificationStore）。擁有者：C。
// 用 A0b 的 service role client，只在後端使用；每個查詢都限定通知的主人。
import { getServiceClient } from '../lib/supabase'
import { supabaseChatRoomStore } from './chatRoomStore'
import type { AnomalyChoice } from './anomaly'
import type { NotificationStore } from './notifications'
import type { NotificationRow, RequestHumanStore } from './requestHuman'

const NOTIFICATION_COLUMNS = 'id, user_id, type, payload, response, read_at, created_at'

export function supabaseNotificationStore(): RequestHumanStore & NotificationStore {
  const { getConversation, getDisplayName } = supabaseChatRoomStore()
  return {
    getConversation,
    getDisplayName,

    async isSeedUser(userId) {
      const { data, error } = await getServiceClient().from('users').select('is_seed').eq('id', userId).maybeSingle()
      if (error) throw new Error(`读取用户失败：${error.message}`)
      return data?.is_seed === true
    },

    async findPendingRequest(conversationId, userId) {
      const { data, error } = await getServiceClient()
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'request_human')
        .eq('payload->>conversationId', conversationId)
        .is('response', null)
        .is('read_at', null)
        .limit(1)
      if (error) throw new Error(`读取通知失败：${error.message}`)
      return (data?.[0]?.id as string | undefined) ?? null
    },

    async insertRequestNotification(userId, payload) {
      const { data, error } = await getServiceClient()
        .from('notifications')
        .insert({ user_id: userId, type: 'request_human', payload })
        .select('id')
        .single()
      if (error) throw new Error(`写入通知失败：${error.message}`)
      return { id: data.id as string }
    },

    async getNotification(id) {
      const { data, error } = await getServiceClient().from('notifications').select(NOTIFICATION_COLUMNS).eq('id', id).maybeSingle()
      if (error) throw new Error(`读取通知失败：${error.message}`)
      return (data as NotificationRow | null) ?? null
    },

    async saveResponse(id, response, readAt) {
      // 條件更新：還沒回應才寫；同時回應兩次只有一次改得到
      const { data, error } = await getServiceClient()
        .from('notifications')
        .update({ response, read_at: readAt })
        .eq('id', id)
        .is('response', null)
        .select('id')
      if (error) throw new Error(`记录回应失败：${error.message}`)
      return (data?.length ?? 0) > 0
    },

    async markRead(id, userId, readAt) {
      const { error } = await getServiceClient()
        .from('notifications')
        .update({ read_at: readAt })
        .eq('id', id)
        .eq('user_id', userId)
        .is('read_at', null)
      if (error) throw new Error(`更新通知失败：${error.message}`)
    },

    async clearResponse(id) {
      const { error } = await getServiceClient().from('notifications').update({ response: null, read_at: null }).eq('id', id)
      if (error) throw new Error(`改回未回应失败：${error.message}`)
    },

    async getAnomalyChoices(userId, flagIds) {
      const { data, error } = await getServiceClient()
        .from('anomaly_flags')
        .select('id, user_choice')
        .eq('notify_user_id', userId)
        .in('id', flagIds)
      if (error) throw new Error(`读取言行异常纪录失败：${error.message}`)
      return Object.fromEntries((data ?? []).map((r) => [r.id as string, (r.user_choice as AnomalyChoice | null) ?? null]))
    },

    async listNotifications(userId, limit) {
      const { data, error } = await getServiceClient()
        .from('notifications')
        .select(NOTIFICATION_COLUMNS)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw new Error(`读取通知失败：${error.message}`)
      return (data ?? []) as NotificationRow[]
    },
  }
}
