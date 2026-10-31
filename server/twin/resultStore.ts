// C5 結果頁的 Supabase 實作（result.ts 的 ResultStore）。擁有者：C。
// match_attempts 只讀「這位用戶自己」那一筆（user_id = 登入者）；對方那一筆不讀。
import { getServiceClient } from '../lib/supabase.js'
import { supabaseChatRoomStore } from './chatRoomStore.js'
import type { AttemptRow, ResultStore } from './result.js'

export function supabaseResultStore(): ResultStore {
  const { getConversation, getDisplayName, listMessages, listMyScores } = supabaseChatRoomStore()
  return {
    getConversation,
    getDisplayName,
    listMessages,
    listMyScores,

    async getMyLatestAttempt(conversationId, userId) {
      const { data, error } = await getServiceClient()
        .from('match_attempts')
        .select('result, outline')
        .eq('conversation_id', conversationId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(`读取代聊结果失败：${error.message}`)
      return (data as AttemptRow | null) ?? null
    },

    async resumeConversation(conversationId) {
      // 只改等本人的對話；同時被結束或接手的話不會被改回 active
      const { error } = await getServiceClient()
        .from('conversations')
        .update({ status: 'active' })
        .eq('id', conversationId)
        .eq('status', 'waiting_human')
      if (error) throw new Error(`更新对话状态失败：${error.message}`)
    },

    async pauseConversation(conversationId) {
      // 只改 active 且雙方都還是分身：聊到一半被結束、或有人本人接手（C6 會設成 active）就不動，
      // 否則本人發言後對方分身會因為 waiting_human 而不回
      const { error } = await getServiceClient()
        .from('conversations')
        .update({ status: 'waiting_human' })
        .eq('id', conversationId)
        .eq('status', 'active')
        .eq('side_a_controller', 'twin')
        .eq('side_b_controller', 'twin')
      if (error) throw new Error(`更新对话状态失败：${error.message}`)
    },
  }
}
