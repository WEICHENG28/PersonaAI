import { useEffect, useState } from 'react'
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
import { isHttpMode, currentUser } from '@lib/api/friend'

/** http 模式下检查过 Supabase session 与否（全局一次性，避免每个守卫都打） */
let sessionChecked = false

/** 需要登录的页面包一层守卫。
 *  http 模式：刷新后 user 只在 Supabase session 里，先 currentUser() 还原再判断，
 *  否则刷新 /chat/<id> 会被踢回登录页、再登录又变成新匿名帐号。
 *  mock 模式：照旧直接看 demo store。
 */
function RequireAuth() {
  const user = useDemoStore((s) => s.user)
  const login = useDemoStore((s) => s.login)
  const navigate = useNavigate()
  const [restoring, setRestoring] = useState(isHttpMode && !sessionChecked)

  useEffect(() => {
    if (!isHttpMode || sessionChecked || user) {
      setRestoring(false)
      return
    }
    let cancelled = false
    // 刷新后从 Supabase session 还原登录状态
    currentUser()
      .then((u) => {
        if (cancelled) return
        if (u) login(u.email, u.nickname, u.id)
        sessionChecked = true
      })
      .catch(() => { sessionChecked = true })
      .finally(() => {
        if (!cancelled) setRestoring(false)
      })
    return () => { cancelled = true }
  }, [user, login])

  if (restoring) return null // 等 session 检查完再决定去向，避免闪跳
  if (!user) {
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
          { path: 'chat/:id', element: <ProxyChatPage /> },
          { path: 'chat/:id/result', element: <ResultPage /> },
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
