// 「我的聊天」列表：頂欄聊天按鈕用，列出還沒結束、和我有關的對話（分身代聊中、等我接手、本人在聊）。擁有者：B。
// 不回傳任何分數；只給名字、真人／示範用戶、狀態和最後一句。
import { getAdminDb } from './db.js'

const LIST_LIMIT = 30
const PREVIEW_MAX = 40

export type ChatState = 'twin_chatting' | 'waiting_you' | 'chatting'

export interface ChatListItem {
  conversationId: string
  otherName: string
  otherIsSeed: boolean
  state: ChatState
  lastMessage: string | null
  lastAt: string
}

export interface ConversationRow {
  id: string
  side_a: string
  side_b: string
  side_a_controller: 'human' | 'twin'
  side_b_controller: 'human' | 'twin'
  status: 'active' | 'waiting_human' | 'ended'
  created_at: string
}

/** 等我接手 → 本人在聊 → 分身代聊中。 */
export function chatState(row: ConversationRow, userId: string): ChatState {
  if (row.status === 'waiting_human') return 'waiting_you'
  const mine = row.side_a === userId ? row.side_a_controller : row.side_b_controller
  return mine === 'human' ? 'chatting' : 'twin_chatting'
}

export function preview(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > PREVIEW_MAX ? `${flat.slice(0, PREVIEW_MAX)}…` : flat
}

const STATE_ORDER: Record<ChatState, number> = { waiting_you: 0, chatting: 1, twin_chatting: 2 }

/** 先排要我處理的，再依最後一句的時間新到舊。 */
export function sortChats(items: ChatListItem[]): ChatListItem[] {
  return [...items].sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || b.lastAt.localeCompare(a.lastAt))
}

export async function listMyChats(userId: string): Promise<ChatListItem[]> {
  const db = getAdminDb()
  if (!db) return []
  const { data: convs, error } = await db
    .from('conversations')
    .select('id,side_a,side_b,side_a_controller,side_b_controller,status,created_at')
    .or(`side_a.eq.${userId},side_b.eq.${userId}`)
    .neq('status', 'ended')
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT)
  if (error) throw error
  const rows = (convs ?? []) as ConversationRow[]
  if (rows.length === 0) return []

  const otherIds = [...new Set(rows.map((r) => (r.side_a === userId ? r.side_b : r.side_a)))]
  const [users, messages] = await Promise.all([
    db.from('users').select('id,display_name,is_seed').in('id', otherIds),
    db
      .from('messages')
      .select('conversation_id,content,created_at')
      .in('conversation_id', rows.map((r) => r.id))
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT * 20),
  ])
  if (users.error) throw users.error
  if (messages.error) throw messages.error

  const people = new Map((users.data ?? []).map((u) => [u.id as string, u as { display_name: string; is_seed: boolean }]))
  const last = new Map<string, { content: string; created_at: string }>()
  for (const m of messages.data ?? []) {
    if (!last.has(m.conversation_id as string)) last.set(m.conversation_id as string, m as { content: string; created_at: string })
  }

  return sortChats(
    rows.map((r) => {
      const other = people.get(r.side_a === userId ? r.side_b : r.side_a)
      const msg = last.get(r.id)
      return {
        conversationId: r.id,
        otherName: other?.display_name ?? '对方',
        otherIsSeed: other?.is_seed === true,
        state: chatState(r, userId),
        lastMessage: msg ? preview(msg.content) : null,
        lastAt: msg?.created_at ?? r.created_at,
      }
    }),
  )
}
