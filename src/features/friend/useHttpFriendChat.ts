import { useCallback, useEffect, useState } from 'react'
import {
  callFriendChat,
  callFriendIntro,
  fetchSettings,
  getFriendMessages,
  isHttpMode,
  triggerNextMeet,
  type FriendMessage,
} from '@lib/api/friend'
import { listTasks } from '@lib/api/social'

/** http 模式的朋友聊天状态（GET /api/friend/messages、POST /api/friend/chat、next-meet）。mock 模式不做任何事。 */
export interface HttpFriendChat {
  messages: FriendMessage[]
  typing: boolean
  error: string | null
  /** 后端建好的待确认任务（显示 B 的 TaskConfirmCard） */
  pendingTaskId: string | null
  clearPendingTask: () => void
  devMode: boolean
  /** 有任务已经代聊过（才显示「模拟下次见面」） */
  hasTaskRun: boolean
  send: (text: string) => Promise<void>
  nextMeet: () => Promise<void>
  nextMeetLoading: boolean
}

export function useHttpFriendChat(): HttpFriendChat {
  const [messages, setMessages] = useState<FriendMessage[]>([])
  const [typing, setTyping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null)
  const [devMode, setDevMode] = useState(false)
  const [hasTaskRun, setHasTaskRun] = useState(false)
  const [nextMeetLoading, setNextMeetLoading] = useState(false)

  useEffect(() => {
    if (!isHttpMode) return
    const init = async () => {
      await callFriendIntro().catch(() => {}) // 幂等，intro_done 时直接 ok；失败不致命
      try {
        setMessages(await getFriendMessages())
      } catch (e) {
        setError(e instanceof Error ? e.message : '读取聊天记录失败')
      }
      // 工作日志面板的开关用后端设定
      fetchSettings()
        .then((s) => setDevMode(s?.dev_mode ?? false))
        .catch(() => {})
      listTasks()
        .then((tasks) => setHasTaskRun(tasks.some((task) => task.progress.chats > 0)))
        .catch(() => {})
    }
    void init()
  }, [])

  const send = useCallback(async (text: string) => {
    // 乐观添加用户消息，再打 API
    const tempId = `tmp-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: 'user', kind: 'chat', content: text, meta: {}, created_at: new Date().toISOString() },
    ])
    setTyping(true)
    setError(null)
    try {
      const result = await callFriendChat(text)
      setMessages(await getFriendMessages())
      if (result.taskId) setPendingTaskId(result.taskId)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '阿澈刚刚恍神了，再说一次？')
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
    } finally {
      setTyping(false)
    }
  }, [])

  // UX #12：成功后直接重新拉讯息，失败用页内提示，不用 alert
  const nextMeet = useCallback(async () => {
    setNextMeetLoading(true)
    setError(null)
    try {
      await triggerNextMeet()
      setMessages(await getFriendMessages())
    } catch (e) {
      setError(e instanceof Error ? e.message : '模拟下次见面失败，请再试一次')
    } finally {
      setNextMeetLoading(false)
    }
  }, [])

  return {
    messages,
    typing,
    error,
    pendingTaskId,
    clearPendingTask: () => setPendingTaskId(null),
    devMode,
    hasTaskRun,
    send,
    nextMeet,
    nextMeetLoading,
  }
}
