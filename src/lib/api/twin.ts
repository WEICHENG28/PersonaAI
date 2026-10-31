/**
 * C 线前端 API（docs/10 §3）。拥有者：C。
 * http 模式：打 /api（带 Supabase JWT）＋订阅 messages 的 Realtime。
 * mock 模式：聊天室、结果页照旧用 demo store（useDemoStore），这里的函数只在 http 模式被调用。
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
  other: { userId: string; name: string; controller: Controller; isSeed?: boolean }
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

/** 为什么你们合的一点：你在意的、对方的表现、第几轮。 */
export interface FitPointView {
  concern: string
  evidence: string
  round: number
}

export interface OutlineView {
  topics: string[]
  fits: string[]
  frictions: string[]
  highlights: string[]
}

export interface ResultMessage extends ChatMessageView {
  round: number
}

/** C5 结果页：只有我方视角；score 是我方的契合度 0–100，对方视角的分数不回。 */
export interface ResultView {
  conversationId: string
  status: ConversationStatus
  me: { userId: string; controller: Controller }
  other: { userId: string; name: string; controller: Controller }
  verdict: { value: VerdictValue; trend: Trend; score?: number } | null
  mutual: boolean
  fitPoints: FitPointView[]
  outline: OutlineView | null
  messages: ResultMessage[]
  /** null = 可以让分身继续聊；否则是不行的原因。 */
  continueBlock: string | null
}

export interface ContinueResult {
  roundCount: number
  ended: boolean
}

/** C6 接手卡片（Prompt 7）：每项最多 3 点。 */
export interface HandoffSummary {
  key_points: string[]
  other_highlights: string[]
  twin_said: string[]
  open_topics: string[]
  suggested_replies: string[]
}

/** C6 本人接手的结果：我方视角的判定＋接手卡片，没有任何分数。 */
export interface TakeoverView {
  conversationId: string
  verdict: { value: VerdictValue; trend: Trend } | null
  summary: HandoffSummary
  /** 接手卡片没整理出来（已经照常接手）。 */
  summaryFailed: boolean
}

export type HumanResponse = 'now' | 'later' | 'decline'
/** C8 言行异常提醒的选择。 */
export type AnomalyChoice = 'continue' | 'end' | 'report'
export type NotificationType = 'match' | 'request_human' | 'friend_report' | 'anomaly'

/** C7 通知铃铛的一则通知：只有铃铛要显示的栏位，没有报告内容和分数。 */
export interface NotificationView {
  id: string
  type: NotificationType
  createdAt: string
  read: boolean
  response: HumanResponse | null
  conversationId: string | null
  /** match 是对方名字、request_human 是请求的人。 */
  name: string | null
  mutual: boolean
  /** anomaly 才有：对方的具体行为摘要。 */
  evidence: string[]
  /** anomaly 才有：你选了什么（还没选是 null）。 */
  choice: AnomalyChoice | null
}

/** C7 回应请求真人的结果；now 且这次真的接手时带接手卡片。 */
export interface RespondView {
  response: HumanResponse
  conversationId: string
  handoff: TakeoverView | null
}

export type LobbyPurpose = 'friend' | 'study' | 'sport' | 'hobby'
export type FitLevel = 'likely' | 'maybe' | 'different'

/** C9 大厅卡片：只有卡片内容与文字的 AI 预估，没有任何分数。 */
export interface LobbyCardView {
  userId: string
  name: string
  headline: string
  tags: string[]
  chatStyle: string
  /** 自填才有，画面要标「仅供娱乐」。 */
  mbti: string | null
  /** 我的档案还没确认时、以及助手附的小卡片是 null。 */
  fit: FitLevel | null
  /** 示范用户（虚构角色）；mock 资料没有这栏就不标。 */
  isSeed?: boolean
}

/** C10 大厅助手：像交办任务就回 taskId（显示任务确认卡），否则回答＋候选人小卡片（都没有分数）。 */
export type LobbyAssistantView =
  | { kind: 'task'; taskId: string }
  | { kind: 'answer'; answer: string; cards: LobbyCardView[] }

export interface LobbyFilterInput {
  purpose?: LobbyPurpose
  q?: string
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

export function getResult(conversationId: string): Promise<ResultView> {
  return request('GET', `/api/conversations/${encodeURIComponent(conversationId)}/result`)
}

/** 让分身继续聊一段（后端跑完才回应，大约要一分钟）。 */
export function continueTwin(conversationId: string): Promise<ContinueResult> {
  return request('POST', `/api/conversations/${encodeURIComponent(conversationId)}/continue`)
}

/** 本人接手：产生接手卡片、我方改成本人（大约要十几秒）。接手后不能交回分身。 */
export function takeOver(conversationId: string): Promise<TakeoverView> {
  return request('POST', `/api/conversations/${encodeURIComponent(conversationId)}/takeover`)
}

/** C7 请求对方本人上线（通知对方，对方选现在聊／稍后聊／拒绝）。 */
export function requestHuman(conversationId: string): Promise<{ notificationId: string }> {
  return request('POST', `/api/conversations/${encodeURIComponent(conversationId)}/request-human`)
}

/** C7 自己最近的通知（新的在前）。 */
export function listNotifications(): Promise<NotificationView[]> {
  return request('GET', '/api/notifications')
}

/** C7 回应请求真人；now 要整理接手卡片，大约十几秒。 */
export function respondNotification(notificationId: string, response: HumanResponse): Promise<RespondView> {
  return request('POST', `/api/notifications/${encodeURIComponent(notificationId)}/respond`, { response })
}

/** C8 回应言行异常提醒：继续聊／结束对话／检举（检举只记录）。 */
export function respondAnomaly(notificationId: string, choice: AnomalyChoice): Promise<{ choice: AnomalyChoice; conversationId: string }> {
  return request('POST', `/api/notifications/${encodeURIComponent(notificationId)}/respond`, { response: choice })
}

/** C7「找到合适的人」点开后设为已读。 */
export function markNotificationRead(notificationId: string): Promise<{ id: string }> {
  return request('POST', `/api/notifications/${encodeURIComponent(notificationId)}/read`)
}

/** C9 大厅卡片（可依找人目的、兴趣关键字筛选）；第一次产生卡片要等几秒。 */
export function getLobby(filter: LobbyFilterInput = {}): Promise<LobbyCardView[]> {
  const params = new URLSearchParams()
  if (filter.purpose) params.set('purpose', filter.purpose)
  if (filter.q?.trim()) params.set('q', filter.q.trim())
  const query = params.toString()
  return request('GET', query ? `/api/lobby?${query}` : '/api/lobby')
}

/** C10 问大厅助手（要等 AI，几秒）。 */
export function askLobbyAssistant(question: string): Promise<LobbyAssistantView> {
  return request('POST', '/api/lobby/assistant', { question })
}

/** C9「我自己聊」：我本人 ↔ 对方分身；已经有还没结束的就接着聊。 */
export function startHumanChat(targetUserId: string): Promise<{ conversationId: string }> {
  return request('POST', '/api/conversations', { targetUserId })
}

/** C9「让分身去聊」：建立单人任务（B），回传任务 id。 */
export function startTwinChat(targetUserId: string): Promise<{ taskId: string }> {
  return request('POST', '/api/lobby/twin-chat', { targetUserId })
}

/**
 * 订阅自己的通知有变化（新增或回应；RLS：只收得到自己的）。回传取消订阅的函数。
 * 资料表事件只当成「该重新读了」的讯号，内容一律重新从 /api/notifications 读。
 */
export function subscribeNotifications(onChange: () => void, onFailed: () => void): () => void {
  let channel: ReturnType<typeof supabase.channel> | null = null
  let cancelled = false
  void supabase.auth
    .getSession()
    .then(({ data }) => supabase.realtime.setAuth(data.session?.access_token ?? null))
    .catch(() => onFailed())
    .finally(() => {
      if (cancelled) return
      channel = supabase
        .channel(`notifications-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => onChange())
        .on('system', {}, (payload: { extension?: string; status?: string }) => {
          if (payload.extension !== 'postgres_changes') return
          if (payload.status === 'ok') onChange()
          else onFailed()
        })
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') onFailed()
        })
    })
  return () => {
    cancelled = true
    if (channel) void supabase.removeChannel(channel)
  }
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
  let channel: ReturnType<typeof supabase.channel> | null = null
  let cancelled = false
  // 先把登录者的 JWT 交给 Realtime 再订阅；否则刚打开页面、session 还没还原时会以匿名身份订阅，RLS 会挡掉所有事件
  void supabase.auth
    .getSession()
    .then(({ data }) => supabase.realtime.setAuth(data.session?.access_token ?? null))
    .catch(() => handlers.onFailed())
    .finally(() => {
      if (!cancelled) channel = openChannel(conversationId, handlers)
    })
  return () => {
    cancelled = true
    if (channel) void supabase.removeChannel(channel)
  }
}

function openChannel(conversationId: string, handlers: MessageSubscription) {
  return supabase
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
