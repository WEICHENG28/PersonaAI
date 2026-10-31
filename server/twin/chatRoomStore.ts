// C4 聊天室的 Supabase 實作（chatRoom.ts 的 ChatRoomStore）。擁有者：C。
// 用 A0b 的 service role client，只在後端使用；match_scores 只讀呼叫者自己視角那幾列。
import { getServiceClient } from '../lib/supabase.js'
import type { ChatMessageView, ChatRoomStore, NewHumanMessage, ScoreRow } from './chatRoom.js'
import type { ConversationRow } from './conversation.js'

const MESSAGE_COLUMNS = 'id, conversation_id, sender_id, is_ai, guard_rewritten, content, created_at'
const CONVERSATION_COLUMNS =
  'id, status, side_a, side_b, side_a_controller, side_b_controller, opening_topic, task_id, round_count, ended_at'

export function supabaseChatRoomStore(): ChatRoomStore {
  return {
    async getConversation(id) {
      const { data, error } = await getServiceClient().from('conversations').select(CONVERSATION_COLUMNS).eq('id', id).maybeSingle()
      if (error) throw new Error(`读取对话失败：${error.message}`)
      return (data as ConversationRow | null) ?? null
    },

    async getDisplayName(userId) {
      const { data, error } = await getServiceClient().from('users').select('display_name').eq('id', userId).maybeSingle()
      if (error) throw new Error(`读取用户名称失败：${error.message}`)
      return (data?.display_name as string | undefined) ?? '用户'
    },

    async isSeedUser(userId) {
      const { data, error } = await getServiceClient().from('users').select('is_seed').eq('id', userId).maybeSingle()
      if (error) throw new Error(`读取用户资料失败：${error.message}`)
      return data?.is_seed === true
    },

    async listMessages(conversationId) {
      const { data, error } = await getServiceClient()
        .from('messages')
        .select(MESSAGE_COLUMNS)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
      if (error) throw new Error(`读取对话消息失败：${error.message}`)
      return (data ?? []) as ChatMessageView[]
    },

    async insertHumanMessage(row: NewHumanMessage) {
      const { data, error } = await getServiceClient()
        .from('messages')
        .insert({ ...row, is_ai: false, guard_rewritten: false })
        .select(MESSAGE_COLUMNS)
        .single()
      if (error) throw new Error(`写入消息失败：${error.message}`)
      return data as ChatMessageView
    },

    async listMyScores(conversationId, perspectiveUserId, limit) {
      const { data, error } = await getServiceClient()
        .from('match_scores')
        .select('round, direction_score, verdict')
        .eq('conversation_id', conversationId)
        .eq('perspective_user_id', perspectiveUserId)
        .order('round', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw new Error(`读取判定失败：${error.message}`)
      return (data ?? []) as ScoreRow[]
    },
  }
}
