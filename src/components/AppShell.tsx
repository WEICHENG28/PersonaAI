import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { NavBar } from '@components/ui/NavBar'
import { useDemoStore } from '@store/useDemoStore'

/** 内容不足一屏就垂直置中的短页（登录页 /login） */
const CENTER_PAGES = ['/login']

/**
 * 应用外壳：所有页面共用同一顶栏（含落地页、登录页）。
 * 手机（<64rem）：极简顶栏 + 底部 tab 拦；桌机：顶栏含 nav。
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const user = useDemoStore((s) => s.user)
  const notifications = useDemoStore((s) => s.notifications)
  const dismissNotification = useDemoStore((s) => s.dismissNotification)
  const location = useLocation()
  const navigate = useNavigate()

  // 有設 ttlMs 的通知時間到自動消失
  useEffect(() => {
    const timers = notifications
      .filter((n) => n.ttlMs)
      .map((n) => window.setTimeout(() => dismissNotification(n.id), Math.max(0, n.at + (n.ttlMs ?? 0) - Date.now())))
    return () => timers.forEach((id) => window.clearTimeout(id))
  }, [notifications, dismissNotification])

  const isCenter = CENTER_PAGES.includes(location.pathname)

  // 滚动阴影已禁用：顶栏阴影保持静态，不随滚动加深

  return (
    <div className="app-shell">
      <NavBar />
      <main
        className={`app-main ${isCenter ? 'page-center' : ''} ${
          user && !isCenter ? 'has-nav' : ''
        }`}
      >
        {children}
      </main>

      {/* 通知吐司（右下角，不挡输入） */}
      <div className="toasts" aria-live="polite">
        {notifications.map((n) => (
          <button
            key={n.id}
            className="toast"
            onClick={() => {
              dismissNotification(n.id)
              if (n.link) navigate(n.link)
            }}
          >
            <strong>{n.title}</strong>
            <span>{n.body}</span>
          </button>
        ))}
      </div>

    </div>
  )
}
