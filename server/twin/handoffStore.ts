// C6 本人接手的 Supabase 實作（handoff.ts 的 HandoffStore）。擁有者：C。
// 用 A0b 的 service role client，只在後端使用。
import { getServiceClient } from '../lib/supabase.js'
import { supabaseChatRoomStore } from './chatRoomStore.js'
import type { HandoffStore, NewHandoff, Side } from './handoff.js'

const CONTROLLER_COLUMN: Record<Side, 'side_a_controller' | 'side_b_controller'> = {
  a: 'side_a_controller',
  b: 'side_b_controller',
}

export function supabaseHandoffStore(): HandoffStore {
  const { getConversation, listMessages, listMyScores } = supabaseChatRoomStore()
  return {
    getConversation,
    listMessages,
    listMyScores,

    async switchToHuman(conversationId, side) {
      // 條件更新：這一方還是分身、對話沒結束才改；兩個請求同時接手時只有一個改得到
      const column = CONTROLLER_COLUMN[side]
      const { data, error } = await getServiceClient()
        .from('conversations')
        .update({ [column]: 'human', status: 'active' })
        .eq('id', conversationId)
        .eq(column, 'twin')
        .neq('status', 'ended')
        .select('id')
      if (error) throw new Error(`更新对话状态失败：${error.message}`)
      return (data?.length ?? 0) > 0
    },

    async insertHandoff(row: NewHandoff) {
      const { error } = await getServiceClient().from('handoffs').insert(row)
      if (error) throw new Error(`写入接手纪录失败：${error.message}`)
    },
  }
}
