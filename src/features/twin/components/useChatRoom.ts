// C4 聊天室资料：第一次读取、Realtime 新消息、定时更新目前判定、本人发言。拥有者：C。
import { useCallback, useEffect, useState } from 'react'
import {
  getChatRoom,
  getChatStatus,
  sendChatMessage,
  subscribeChatMessages,
  TwinApiError,
  type ChatMessageView,
  type ChatRoomView,
  type ChatStatusView,
} from '@lib/api/twin'
import { CHAT_TEXT, expectsTwinReply, mergeMessages, withStatus } from './chatRoomView'

/** 多久更新一次目前判定与「谁在聊」（match_scores、conversations 没有 Realtime）。 */
const STATUS_POLL_MS = 5000
/** Realtime 断线时，多久重新读一次消息。 */
const FALLBACK_POLL_MS = 4000

export interface ChatRoomState {
  room: ChatRoomView | null
  verdict: ChatStatusView['verdict']
  loadError: string | null
  notice: string | null
  sending: boolean
  twinTyping: boolean
  send(text: string): Promise<boolean>
}

function messageOf(err: unknown): string {
  return err instanceof TwinApiError ? err.message : '出了点问题，再试一次？'
}

export function useChatRoom(conversationId: string): ChatRoomState {
  const [room, setRoom] = useState<ChatRoomView | null>(null)
  const [status, setStatus] = useState<ChatStatusView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [twinTyping, setTwinTyping] = useState(false)
  const [realtimeDown, setRealtimeDown] = useState(false)

  const addMessages = useCallback((incoming: readonly ChatMessageView[]) => {
    setRoom((prev) => (prev ? { ...prev, messages: mergeMessages(prev.messages, incoming) } : prev))
  }, [])

  /** 重新读整个聊天室；保留 Realtime 已经收到、但这次读取还没包含的消息。 */
  const reload = useCallback(async () => {
    try {
      const fresh = await getChatRoom(conversationId)
      setRoom((prev) => (prev ? { ...fresh, messages: mergeMessages(prev.messages, fresh.messages) } : fresh))
      setLoadError(null)
    } catch (err) {
      setLoadError(messageOf(err))
    }
  }, [conversationId])

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await getChatStatus(conversationId))
      setNotice((n) => (n === CHAT_TEXT.statusFailed ? null : n))
    } catch {
      setNotice(CHAT_TEXT.statusFailed)
    }
  }, [conversationId])

  // 第一次读取＋Realtime 订阅
  useEffect(() => {
    setRoom(null)
    setStatus(null)
    setRealtimeDown(false)
    void reload()
    void refreshStatus()
    return subscribeChatMessages(conversationId, {
      onMessage: (m) => addMessages([m]),
      onListening: () => void reload(),
      onFailed: () => setRealtimeDown(true),
    })
  }, [conversationId, reload, refreshStatus, addMessages])

  // 目前判定定时更新
  useEffect(() => {
    const timer = setInterval(() => void refreshStatus(), STATUS_POLL_MS)
    return () => clearInterval(timer)
  }, [refreshStatus])

  // Realtime 断线时改用轮询
  useEffect(() => {
    if (!realtimeDown) return
    const timer = setInterval(() => void reload(), FALLBACK_POLL_MS)
    return () => clearInterval(timer)
  }, [realtimeDown, reload])

  const live = room ? withStatus(room, status) : null

  const send = useCallback(
    async (text: string): Promise<boolean> => {
      if (!live) return false
      setSending(true)
      setTwinTyping(expectsTwinReply(live))
      setNotice(null)
      try {
        const result = await sendChatMessage(conversationId, text)
        addMessages([result.message])
        if (result.replyFailed) setNotice(CHAT_TEXT.replyFailed)
        await reload()
        return true
      } catch (err) {
        setNotice(messageOf(err))
        return false
      } finally {
        setSending(false)
        setTwinTyping(false)
      }
    },
    [live, conversationId, addMessages, reload],
  )

  return { room: live, verdict: status?.verdict ?? null, loadError, notice, sending, twinTyping, send }
}
