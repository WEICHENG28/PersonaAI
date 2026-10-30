/**
 * C 线前端 API（docs/10 §3）。拥有者：C。
 * http 模式：打 /api（带 Supabase JWT）＋订阅 messages 的 Realtime。
 * mock 模式：聊天室页面照旧用 demo store（useDemoStore），这里的函数只在 http 模式被调用。
 */
import { supabase, isHttpMode } from '../supabase'

export type Controller = 'human' | 'twin'
export type ConversationStatus = 'active' | 'waiting_human' | 'ended'
export type VerdictValue = 'suitable' | 'unsuitable' | 'uncertain'
export type Trend = 'up' | 'flat' | 'down'

export interface ChatMessageView {
  id: string
  conversation_id: string
  sender_id: string
  is_ai: boolean
  guard_rewritten: boolean
  content: string
  created_at: string
}

export interface ChatRoomView {
  conversationId: string
  status: ConversationStatus
  me: { userId: string; controller: Controller }
  other: { userId: string; name: string; controller: Controller }
  messages: ChatMessageView[]
}

/** 目前判定：只有我方视角的文字判定与走势，没有分数。 */
export interface ChatStatusView {
  status: ConversationStatus
  myController: Controller
  otherController: Controller
  verdict: { value: VerdictValue; trend: Trend } | null
}

export interface SendResult {
  message: ChatMessageView
  replied: boolean
  replyFailed: boolean
}

/** 失败时丢出的错误，message 是可以直接给用户看的简体中文；status 是 HTTP 状态码（连不上时为 0）。 */
export class TwinApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'TwinApiError'
  }
}

/** 聊天室要走真资料（http 模式）还是 demo。 */
export const isLiveChat = isHttpMode

export function getChatRoom(conversationId: string): Promise<ChatRoomView> {
  return request('GET', `/api/conversations/${encodeURIComponent(conversationId)}`)
}

export function getChatStatus(conversationId: string): Promise<ChatStatusView> {
  return request('GET', `/api/conversations/${encodeURIComponent(conversationId)}/status`)
}

export function sendChatMessage(conversationId: string, text: string): Promise<SendResult> {
  return request('POST', `/api/conversations/${encodeURIComponent(conversationId)}/messages`, { text })
}

export interface MessageSubscription {
  /** 新消息（Realtime INSERT）。 */
  onMessage(message: ChatMessageView): void
  /** 服务器确认开始监听数据表；之前写入的消息可能漏掉，要重新读一次。 */
  onListening(): void
  /** 订阅失败或断线，改用轮询。 */
  onFailed(): void
}

/**
 * 订阅这段对话的新消息（RLS：只有对话双方收得到）。回传取消订阅的函数。
 * 注意：subscribe() 回 SUBSCRIBED 时还没开始监听表，要等 system 消息（C0 实测）。
 */
export function subscribeChatMessages(conversationId: string, handlers: MessageSubscription): () => void {
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => handlers.onMessage(payload.new as ChatMessageView),
    )
    .on('system', {}, (payload: { extension?: string; status?: string }) => {
      if (payload.extension !== 'postgres_changes') return
      if (payload.status === 'ok') handlers.onListening()
      else handlers.onFailed()
    })
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') handlers.onFailed()
    })
  return () => {
    void supabase.removeChannel(channel)
  }
}

/** 带上登录的 Supabase JWT，后端用它认出是谁。 */
async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body) headers['content-type'] = 'application/json'
  let res: Response
  try {
    res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  } catch {
    throw new TwinApiError('连不上服务器，请确认后端有在运行', 0)
  }
  const json = (await res.json().catch(() => null)) as { ok: boolean; data?: T; error?: string } | null
  if (!json?.ok) throw new TwinApiError(json?.error ?? '服务器发生错误，请稍后再试', res.status)
  return json.data as T
}
