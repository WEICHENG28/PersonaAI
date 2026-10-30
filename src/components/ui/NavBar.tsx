import { NavLink, useLocation, useNavigate } from 'react-router'
import { RiveAvatar } from './RiveAvatar'
import { useDemoStore } from '@store/useDemoStore'
import { t } from '@i18n/t'

const TABS = [
  { to: '/friend', key: 'nav.friend' as const, match: /^\/(friend|chat)/ },
  { to: '/lobby', key: 'nav.lobby' as const, match: /^\/lobby/ },
  { to: '/history', key: 'nav.history' as const, match: /^\/history/ },
  { to: '/profile', key: 'nav.profile' as const, match: /^\/profile/ },
  { to: '/settings', key: 'nav.settings' as const, match: /^\/settings/ },
]

/**
 * 导航（CSS 按宽度切换，两套 DOM 都在但只显示一套）：
 * - 手机（<64rem）：底部 tab 拦（触控 ≥44px、safe-area）
 * - 桌机（≥64rem）：顶栏（撕纸 bar）＋卡纸 tab
 */
export function NavBar() {
  const location = useLocation()
  const user = useDemoStore((s) => s.user)
  const unread = useDemoStore((s) => s.notifications.length)

  const isActive = (tab: (typeof TABS)[number]) => tab.match.test(location.pathname)

  return (
    <>
      {/* ── 桌机顶栏 ── */}
      <header className="topbar safe-top">
        <div className="topbar__paper tear-bar">
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
            {user ? <FriendKnob unread={unread} /> : <AuthKnob />}
          </nav>
        </div>
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
        </nav>
      )}
    </>
  )
}

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

function AuthKnob() {
  const navigate = useNavigate()
  return (
    <button className="knob" onClick={() => navigate('/')}>
      登录
    </button>
  )
}
