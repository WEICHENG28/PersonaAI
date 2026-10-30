import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { NavBar } from '@components/ui/NavBar'
import { useDemoStore } from '@store/useDemoStore'

/** 内容不足一屏就垂直置中的短页（登录） */
const CENTER_PAGES = ['/']

/**
 * 应用外壳：所有页面共用同一顶栏（含落地页、登录页）。
 * 手机（<64rem）：极简顶栏 + 底部 tab 拦；桌机：顶栏含 nav。
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const user = useDemoStore((s) => s.user)
  const notifications = useDemoStore((s) => s.notifications)
  const dismissNotification = useDemoStore((s) => s.dismissNotification)
  const location = useLocation()

  const isCenter = CENTER_PAGES.includes(location.pathname)

  // 滚动后顶栏加强阴影（.is-scrolled）
  useEffect(() => {
    const onScroll = () => {
      document.querySelector('.app-shell')?.classList.toggle('is-scrolled', window.scrollY > 8)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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
          <button key={n.id} className="toast" onClick={() => dismissNotification(n.id)}>
            <strong>{n.title}</strong>
            <span>{n.body}</span>
          </button>
        ))}
      </div>

    </div>
  )
}
