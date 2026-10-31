import { NavLink, useLocation, useNavigate } from 'react-router'
import { RiveAvatar } from './RiveAvatar'
import { useDemoStore } from '@store/useDemoStore'
import { t } from '@i18n/t'
import { NotificationBell } from '@features/twin/components/NotificationBell'

const TABS = [
  { to: '/friend', key: 'nav.friend' as const, match: /^\/(friend|chat)/ },
  { to: '/lobby', key: 'nav.lobby' as const, match: /^\/lobby/ },
  { to: '/history', key: 'nav.history' as const, match: /^\/history/ },
  { to: '/tasks', key: 'nav.tasks' as const, match: /^\/tasks/ },
]

/**
 * 全站统一顶栏（每页都有，sticky + 撕纸下缘阴影）：
 * - wordmark → /landing
 * - 桌机：nav knobs（朋友/大厅/历史）
 * - 右端：已登录 → Profile 钮 + 阿澈（通知）；未登录 → 开始使用（梨黄按钮）
 * - 手机：nav 收进底拦（.knobs 隐藏），顶栏保留 wordmark + 右端钮
 */
export function NavBar() {
  const location = useLocation()
  const user = useDemoStore((s) => s.user)
  const unread = useDemoStore((s) => s.notifications.length)

  const isActive = (tab: (typeof TABS)[number]) => tab.match.test(location.pathname)

  return (
    <>
      <header className="topbar safe-top">
        <nav className="topbar__inner">
          <NavLink to="/landing" className="wordmark">
            PersonaAI
          </NavLink>

          {user && (
            <div className="knobs">
              {TABS.map((tab) => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  className={`knob ${isActive(tab) ? 'is-on' : ''}`}
                >
                  {t(tab.key)}
                </NavLink>
              ))}
            </div>
          )}

          {user ? (
            <div className="topbar__right">
              <NotificationBell />
              <FriendKnob unread={unread} />
              <ProfileKnob />
              <SettingsKnob />
            </div>
          ) : (
            <StartNowKnob />
          )}
        </nav>
      </header>

      {/* ── 手机底部 tab 拦 ── */}
      {user && (
        <nav className="tabbar safe-bottom" aria-label="主导览">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={`tabbar__tab ${isActive(tab) ? 'is-on' : ''}`}
            >
              <span className="tabbar__label">{t(tab.key)}</span>
              {tab.to === '/friend' && unread > 0 && <i className="tabbar__dot" />}
            </NavLink>
          ))}
          {/* Profile 也进底拦（第 4 格） */}
          <NavLink
            to="/profile"
            className={`tabbar__tab ${/^\/profile/.test(location.pathname) ? 'is-on' : ''}`}
          >
            <span className="tabbar__label">{t('nav.profile')}</span>
          </NavLink>
          {/* Settings 进底拦（第 5 格） */}
          <NavLink
            to="/settings"
            className={`tabbar__tab ${/^\/settings/.test(location.pathname) ? 'is-on' : ''}`}
          >
            <span className="tabbar__label">设置</span>
          </NavLink>
        </nav>
      )}
    </>
  )
}

/** Profile 钮：头像圆片 + 名字，点去 /profile */
function ProfileKnob() {
  const navigate = useNavigate()
  const nickname = useDemoStore((s) => s.user?.nickname ?? '我')
  return (
    <button className="knob knob--profile" onClick={() => navigate('/profile')} title="我的档案">
      <span className="knob__avatar">{nickname.slice(0, 1)}</span>
      <span className="knob__meta">{nickname}</span>
    </button>
  )
}

/** 设置按钮（顶栏右端，⚙ 图标） */
function SettingsKnob() {
  const navigate = useNavigate()
  const location = useLocation()
  const isActive = /^\/settings/.test(location.pathname)
  return (
    <button
      className={`knob knob--settings ${isActive ? 'is-on' : ''}`}
      onClick={() => navigate('/settings')}
      title="设置"
      aria-label="设置"
    >
      <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>⚙</span>
    </button>
  )
}

/** 未登录：梨黄开始使用（顶栏 CTA） */
function StartNowKnob() {
  const navigate = useNavigate()
  return (
    <button className="btn btn--primary btn--small topbar__cta" onClick={() => navigate('/')}>
      开始使用
    </button>
  )
}

/** 阿澈：通知铃 + 报回报 */
function FriendKnob({ unread }: { unread: number }) {
  const navigate = useNavigate()
  const reportReady = useDemoStore((s) => s.reportReady)
  return (
    <button
      className="knob knob--friend"
      onClick={() => navigate('/friend')}
      title={reportReady ? '阿澈有事想跟你说' : '阿澈'}
    >
      <RiveAvatar name="robot" size={26} />
      <span className="knob__meta">{reportReady ? '有新回报' : '阿澈'}</span>
      {unread > 0 && <span className="notif-count">{unread}</span>}
    </button>
  )
}
