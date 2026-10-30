// C7 通知铃铛资料：第一次读取、Realtime 有变化就重读（断线改轮询）、回应请求真人、设为已读。拥有者：C。
import { useCallback, useEffect, useState } from 'react'
import {
  listNotifications,
  markNotificationRead,
  respondNotification,
  subscribeNotifications,
  TwinApiError,
  type HumanResponse,
  type NotificationView,
  type RespondView,
} from '@lib/api/twin'
import { NOTIFY_TEXT, withRead, withResponse } from './notificationView'

/** Realtime 断线时，多久重新读一次通知。 */
const FALLBACK_POLL_MS = 15000

export interface NotificationsState {
  list: NotificationView[]
  loadError: string | null
  /** 每一则的错误（回应失败等）。 */
  errors: Record<string, string>
  /** 正在处理的那一则。 */
  busyId: string | null
  respond(n: NotificationView, response: HumanResponse): Promise<RespondView | null>
  markRead(n: NotificationView): Promise<void>
  /** 重新读一次（打开面板时用，Realtime 漏掉事件也不会一直是旧的）。 */
  reload(): Promise<void>
}

function messageOf(err: unknown): string {
  return err instanceof TwinApiError ? err.message : '出了点问题，再试一次？'
}

export function useNotifications(enabled: boolean): NotificationsState {
  const [list, setList] = useState<NotificationView[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [realtimeDown, setRealtimeDown] = useState(false)

  const reload = useCallback(async () => {
    try {
      setList(await listNotifications())
      setLoadError(null)
    } catch {
      setLoadError(NOTIFY_TEXT.loadFailed)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    setRealtimeDown(false)
    void reload()
    return subscribeNotifications(
      () => void reload(),
      () => setRealtimeDown(true),
    )
  }, [enabled, reload])

  useEffect(() => {
    if (!enabled || !realtimeDown) return
    const timer = setInterval(() => void reload(), FALLBACK_POLL_MS)
    return () => clearInterval(timer)
  }, [enabled, realtimeDown, reload])

  const setError = (id: string, message: string | null) =>
    setErrors((prev) => {
      const { [id]: _drop, ...rest } = prev
      return message ? { ...rest, [id]: message } : rest
    })

  const respond = useCallback(
    async (n: NotificationView, response: HumanResponse): Promise<RespondView | null> => {
      setBusyId(n.id)
      setError(n.id, null)
      try {
        const view = await respondNotification(n.id, response)
        setList((prev) => withResponse(prev, n.id, response))
        return view
      } catch (err) {
        setError(n.id, messageOf(err))
        await reload()
        return null
      } finally {
        setBusyId(null)
      }
    },
    [reload],
  )

  const markRead = useCallback(async (n: NotificationView) => {
    if (n.read) return
    setList((prev) => withRead(prev, n.id))
    try {
      await markNotificationRead(n.id)
    } catch {
      // 设为已读失败不挡跳转；下次重读时会再显示成未读
    }
  }, [])

  return { list, loadError, errors, busyId, respond, markRead, reload }
}
