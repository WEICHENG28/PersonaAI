// C 線讀寫 conversations、messages 的 Supabase 實作（twin.ts 的 TwinStore、conversation.ts 的 ConversationStore）。擁有者：C。
// 用 A0b 的 service role client，只在後端使用。
import type { ChatMessage } from '../../shared/types'
import { getServiceClient } from '../lib/supabase'
import type { ConversationPatch, ConversationRow, ConversationStore, NewConversationRow } from './conversation'
import type { NewTwinMessage, TwinConversation, TwinMessageRow, TwinStore } from './twin'

const MESSAGE_COLUMNS = 'id, conversation_id, sender_id, is_ai, content, created_at'

export function supabaseTwinStore(): TwinStore {
  return {
    async getConversation(id) {
      const { data, error } = await getServiceClient()
        .from('conversations')
        .select('id, status, side_a, side_b, side_a_controller, side_b_controller, opening_topic, task_id')
        .eq('id', id)
        .maybeSingle()
      if (error) throw new Error(`读取对话失败：${error.message}`)
      return (data as TwinConversation | null) ?? null
    },

    async getDisplayName(userId) {
      const { data, error } = await getServiceClient().from('users').select('display_name').eq('id', userId).maybeSingle()
      if (error) throw new Error(`读取用户名称失败：${error.message}`)
      return (data?.display_name as string | undefined) ?? '用户'
    },

    async getRecentMessages(conversationId, limit) {
      // 取最新的 limit 則再反轉成由舊到新
      const { data, error } = await getServiceClient()
        .from('messages')
        .select('sender_id, content, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw new Error(`读取对话消息失败：${error.message}`)
      return [...((data ?? []) as TwinMessageRow[])].reverse()
    },

    async insertMessage(row: NewTwinMessage) {
      const { data, error } = await getServiceClient().from('messages').insert(row).select(MESSAGE_COLUMNS).single()
      if (error) throw new Error(`写入消息失败：${error.message}`)
      return data as ChatMessage
    },
  }
}

const CONVERSATION_COLUMNS =
  'id, status, side_a, side_b, side_a_controller, side_b_controller, opening_topic, task_id, round_count, ended_at'

/** C3 代聊函式用：建立、讀取、更新 conversations，讀取整段 messages。 */
export function supabaseConversationStore(): ConversationStore {
  return {
    async createConversation(row: NewConversationRow) {
      const { data, error } = await getServiceClient().from('conversations').insert(row).select(CONVERSATION_COLUMNS).single()
      if (error) throw new Error(`建立对话失败：${error.message}`)
      return data as ConversationRow
    },

    async getConversation(id) {
      const { data, error } = await getServiceClient().from('conversations').select(CONVERSATION_COLUMNS).eq('id', id).maybeSingle()
      if (error) throw new Error(`读取对话失败：${error.message}`)
      return (data as ConversationRow | null) ?? null
    },

    async updateConversation(id, patch: ConversationPatch) {
      const { error } = await getServiceClient().from('conversations').update(patch).eq('id', id)
      if (error) throw new Error(`更新对话失败：${error.message}`)
    },

    async deleteConversation(id) {
      const { error } = await getServiceClient().from('conversations').delete().eq('id', id)
      if (error) throw new Error(`删除对话失败：${error.message}`)
    },

    async getLastSenderId(conversationId) {
      const { data, error } = await getServiceClient()
        .from('messages')
        .select('sender_id')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(`读取对话消息失败：${error.message}`)
      return (data?.sender_id as string | undefined) ?? null
    },

    async listMessages(conversationId) {
      const { data, error } = await getServiceClient()
        .from('messages')
        .select(MESSAGE_COLUMNS)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
      if (error) throw new Error(`读取对话消息失败：${error.message}`)
      return (data ?? []) as ChatMessage[]
    },
  }
}
