import { Outlet, useNavigate } from 'react-router'
import { AppShell } from '@components/AppShell'
import { useDemoStore } from '@store/useDemoStore'
import { t } from '@i18n/t'
import { Button } from '@components/ui/Button'
import { LoginPage } from '@features/friend/LoginPage'
import { LandingPage } from '@features/landing/LandingPage'
import { FriendPage } from '@features/friend/FriendPage'
import { ProxyChatPage } from '@features/twin/ProxyChatPage'
import { ResultPage } from '@features/twin/ResultPage'
import { HandoffPage } from '@features/twin/HandoffPage'
import { LobbyPage } from '@features/twin/LobbyPage'
import { HistoryPage } from '@features/social/HistoryPage'
import { ProfilePage } from '@features/friend/ProfilePage'
import { SettingsPage } from '@features/friend/SettingsPage'

/** 需要登录的页面包一层守卫 */
function RequireAuth() {
  const user = useDemoStore((s) => s.user)
  const navigate = useNavigate()
  if (!user) {
    // render-phase redirect 用 effect 太晚，直接在 AppShell 层跳
    queueMicrotask(() => navigate('/', { replace: true }))
    return null
  }
  return <Outlet />
}

function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('notFound.title')}</h1>
        <p>{t('notFound.description')}</p>
      </div>
      <Button onClick={() => navigate('/friend')}>{t('notFound.back')}</Button>
    </div>
  )
}

export const routes = [
  {
    path: '/',
    element: (
      <AppShell>
        <Outlet />
      </AppShell>
    ),
    children: [
      { index: true, element: <LoginPage /> },
      { path: 'landing', element: <LandingPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: 'friend', element: <FriendPage /> },
          { path: 'chat/lin', element: <ProxyChatPage /> },
          { path: 'chat/lin/result', element: <ResultPage /> },
          { path: 'chat/lin/handoff', element: <HandoffPage /> },
          { path: 'lobby', element: <LobbyPage /> },
          { path: 'history', element: <HistoryPage /> },
          { path: 'profile', element: <ProfilePage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
