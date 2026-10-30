import { useNavigate, useLocation } from 'react-router'
import { NavBar } from '@components/ui/NavBar'
import { useDemoStore } from '@store/useDemoStore'

/** 不显示任何导航的「全屏页」：落地页、登录页 */
const BARE_ROUTES = ['/', '/landing']

/**
 * 应用外壳：
 * - 落地页 / 登录页：无导航
 * - 其他页：桌机顶栏（撕纸 bar）＋ 手机底部 tab 拦（CSS 按宽度切换）
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const user = useDemoStore((s) => s.user)
  const notifications = useDemoStore((s) => s.notifications)
  const dismissNotification = useDemoStore((s) => s.dismissNotification)
  const navigate = useNavigate()
  const location = useLocation()

  const isBare = BARE_ROUTES.includes(location.pathname)

  return (
    <div className="app-shell">
      {!isBare && <NavBar />}
      <main className={`app-main ${!isBare && user ? 'has-nav' : ''}`}>{children}</main>

      {/* 通知吐司（右下角，不挡输入） */}
      <div className="toasts" aria-live="polite">
        {notifications.map((n) => (
          <button key={n.id} className="toast" onClick={() => dismissNotification(n.id)}>
            <strong>{n.title}</strong>
            <span>{n.body}</span>
          </button>
        ))}
      </div>

      {/* 回到顶部的跳转按钮（无 JS 时也可见） */}
      {!isBare && !user && (
        <button className="sr-back" onClick={() => navigate('/landing')}>
          回首页
        </button>
      )}
    </div>
  )
}
