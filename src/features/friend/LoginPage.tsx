import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Button } from '@components/ui/Button'
import { RiveAvatar } from '@components/ui/RiveAvatar'
import { useDemoStore } from '@store/useDemoStore'
import { t } from '@i18n/t'
import { isHttpMode, loginAnonymously, initProfile } from '@lib/api/friend'
import { randomName } from './randomName'

/**
 * 画面 1：只要用户名称（随机预填），什么都不打也能直接开始。
 * http 模式用 Supabase 匿名登录建真帐号；mock 模式假登录。
 * 邮箱登录/注册函数仍在 @lib/api/friend（register、login），之后要「绑定邮箱」可再接回。
 */
export function LoginPage() {
  const login = useDemoStore((s) => s.login)
  const navigate = useNavigate()
  // 从落地页「先逛逛大厅」来的：提示一行，登录后直接去大厅
  const [params] = useSearchParams()
  const fromLobby = params.get('from') === 'lobby'
  const [name, setName] = useState(randomName)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const start = async () => {
    const nickname = name.trim() || randomName()
    setBusy(true)
    setError(null)
    try {
      if (isHttpMode) {
        const user = await loginAnonymously(nickname)
        await initProfile() // 确保 users 表有行（幂等）
        login(user.email, user.nickname, user.id)
      } else {
        login('', nickname)
      }
      navigate(fromLobby ? '/lobby' : '/friend', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : t('login.errorGeneric'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-hero">
        <RiveAvatar name="birdie" size={140} className="login-bird" />
        <h1>{t('login.title')}</h1>
        <p className="login-sub">{t('login.subtitle')}</p>
        {fromLobby && <p className="login-hint" role="status">{t('login.lobbyHint')}</p>}
      </div>

      <div className="login-card card">
        <label className="field">
          <span>
            {t('login.username')} <em>{t('login.usernameHint')}</em>
          </span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !busy && start()}
            maxLength={20}
          />
        </label>

        <Button variant="secondary" small style={{ justifySelf: 'start' }} onClick={() => setName(randomName())}>
          {t('login.shuffle')}
        </Button>

        {error && <p className="login-error">{error}</p>}

        <Button block disabled={busy} onClick={start}>
          {busy ? t('login.loading') : t('login.start')}
        </Button>

        <p className="login-hint">{t('login.demoHintStart')}</p>
      </div>

      <p className="login-footer">{t('login.footer')}</p>
    </div>
  )
}
