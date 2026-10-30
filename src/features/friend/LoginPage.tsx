import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@components/ui/Button'
import { RiveAvatar } from '@components/ui/RiveAvatar'
import { useDemoStore } from '@store/useDemoStore'
import { t } from '@i18n/t'
import { currentUser, isHttpMode, loginAnonymously, initProfile } from '@lib/api/friend'
import { randomName } from './randomName'

/**
 * 画面 1：只要用户名称（随机预填），什么都不打也能直接开始。
 * http 模式用 Supabase 匿名登录建真帐号；mock 模式假登录。
 * 这个浏览器已经登录过（有 Supabase session）就沿用原帐号，不会每次都建新帐号。
 * 邮箱登录/注册函数仍在 @lib/api/friend（register、login），之后要「绑定邮箱」可再接回。
 */
export function LoginPage() {
  const login = useDemoStore((s) => s.login)
  const navigate = useNavigate()
  const [name, setName] = useState(randomName)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // 已经登录过：直接回到原帐号，不显示登录页
  useEffect(() => {
    if (!isHttpMode) return
    let alive = true
    currentUser()
      .then(async (user) => {
        if (!alive || !user) return
        await initProfile()
        login(user.email, user.nickname, user.id)
        navigate('/friend', { replace: true })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [login, navigate])

  const start = async () => {
    const nickname = name.trim() || randomName()
    setBusy(true)
    setError(null)
    try {
      if (isHttpMode) {
        const user = (await currentUser()) ?? (await loginAnonymously(nickname))
        await initProfile() // 确保 users 表有行（幂等）
        login(user.email, user.nickname, user.id)
      } else {
        login('', nickname)
      }
      navigate('/friend', { replace: true })
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
