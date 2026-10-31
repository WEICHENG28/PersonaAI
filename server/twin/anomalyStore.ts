// C8 言行異常提醒的 Supabase 實作（anomaly.ts 的 AnomalyStore）。擁有者：C。
// 用 A0b 的 service role client，只在後端使用；anomaly_flags 前端只讀得到 notify_user_id 是自己的列（RLS）。
import { getServiceClient } from '../lib/supabase'
import type { AnomalyChoice, AnomalyFlagRow, AnomalyStore, NewAnomalyFlag } from './anomaly'
import { supabaseNotificationStore } from './notificationStore'

export function supabaseAnomalyStore(): AnomalyStore {
  const { getConversation, getNotification, markRead, clearResponse } = supabaseNotificationStore()
  return {
    getConversation,
    getNotification,
    markRead,
    clearResponse,

    async listHumanMessages(conversationId, userId) {
      const { data, error } = await getServiceClient()
        .from('messages')
        .select('content')
        .eq('conversation_id', conversationId)
        .eq('sender_id', userId)
        .eq('is_ai', false)
        .order('created_at', { ascending: true })
      if (error) throw new Error(`读取本人消息失败：${error.message}`)
      return (data ?? []).map((m) => m.content as string)
    },

    async hasFlag(conversationId, flaggedUserId) {
      const { data, error } = await getServiceClient()
        .from('anomaly_flags')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('flagged_user_id', flaggedUserId)
        .limit(1)
      if (error) throw new Error(`读取言行异常纪录失败：${error.message}`)
      return (data?.length ?? 0) > 0
    },

    async insertFlag(row: NewAnomalyFlag) {
      const { data, error } = await getServiceClient().from('anomaly_flags').insert(row).select('id').single()
      if (error) throw new Error(`写入言行异常纪录失败：${error.message}`)
      return { id: data.id as string }
    },

    async insertAnomalyNotification(userId, payload) {
      const { data, error } = await getServiceClient()
        .from('notifications')
        .insert({ user_id: userId, type: 'anomaly', payload })
        .select('id')
        .single()
      if (error) throw new Error(`写入通知失败：${error.message}`)
      return { id: data.id as string }
    },

    async getFlag(id) {
      const { data, error } = await getServiceClient()
        .from('anomaly_flags')
        .select('id, conversation_id, notify_user_id, user_choice')
        .eq('id', id)
        .maybeSingle()
      if (error) throw new Error(`读取言行异常纪录失败：${error.message}`)
      return (data as AnomalyFlagRow | null) ?? null
    },

    async saveChoice(flagId, choice: AnomalyChoice) {
      // 條件更新：還沒選過才寫；同時選兩次只有一次改得到
      const { data, error } = await getServiceClient()
        .from('anomaly_flags')
        .update({ user_choice: choice })
        .eq('id', flagId)
        .is('user_choice', null)
        .select('id')
      if (error) throw new Error(`记录选择失败：${error.message}`)
      return (data?.length ?? 0) > 0
    },

    async clearChoice(flagId) {
      const { error } = await getServiceClient().from('anomaly_flags').update({ user_choice: null }).eq('id', flagId)
      if (error) throw new Error(`改回没选过失败：${error.message}`)
    },
  }
}
