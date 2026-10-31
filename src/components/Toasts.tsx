import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useDemoStore } from '@store/useDemoStore'

/** 吐司显示多久 */
const TOAST_MS = 6000
/** 最多同时几张 */
const MAX_TOASTS = 2

/**
 * 通知吐司（UX #18）：只弹新通知、6 秒自动收起、最多 2 张。
 * 点吐司 → 带到相关页面，并清掉这则未读（阿澈按钮的红点用同一份 notifications）。
 * 自动收起只是不再显示吐司，未读仍留在红点里。
 */
export function Toasts() {
  const notifications = useDemoStore((s) => s.notifications)
  const dismiss = useDemoStore((s) => s.dismissNotification)
  const navigate = useNavigate()
  const seen = useRef<Set<string> | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const [shown, setShown] = useState<string[]>([])

  useEffect(() => {
    // 第一次（含重新整理后）：已存在的通知不再弹吐司
    if (!seen.current) {
      seen.current = new Set(notifications.map((n) => n.id))
      return
    }
    for (const n of notifications) {
      if (seen.current.has(n.id)) continue
      seen.current.add(n.id)
      setShown((list) => [...list, n.id].slice(-MAX_TOASTS))
      timers.current.push(setTimeout(() => setShown((list) => list.filter((id) => id !== n.id)), TOAST_MS))
    }
  }, [notifications])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const visible = notifications.filter((n) => shown.includes(n.id))

  return (
    <div className="toasts" aria-live="polite">
      {visible.map((n) => (
        <button
          key={n.id}
          className="toast"
          onClick={() => {
            dismiss(n.id)
            setShown((list) => list.filter((id) => id !== n.id))
            if (n.link) navigate(n.link)
          }}
        >
          <strong>{n.title}</strong>
          <span>{n.body}</span>
        </button>
      ))}
    </div>
  )
}
