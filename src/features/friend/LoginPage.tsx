import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@components/ui/Button'
import { RiveAvatar } from '@components/ui/RiveAvatar'
import { useDemoStore } from '@store/useDemoStore'
import { t } from '@i18n/t'
import { isHttpMode, register, login as authLogin, initProfile } from '@lib/api/friend'
import { randomName } from './randomName'

/** 画面 1：登录/注册。http 模式走 Supabase Auth；mock 模式只要用户名称（随机预填），什么都不打也能直接开始。 */
export function LoginPage() {
  return isHttpMode ? <AuthLogin /> : <DemoLogin />
}

/** mock 模式：只有用户名称，预填随机名字。 */
function DemoLogin() {
  const login = useDemoStore((s) => s.login)
  const navigate = useNavigate()
  const [name, setName] = useState(randomName)

  const start = () => {
    login('', name.trim() || randomName())
    navigate('/friend', { replace: true })
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
            onKeyDown={(e) => e.key === 'Enter' && start()}
            maxLength={20}
          />
        </label>

        <Button variant="secondary" small style={{ justifySelf: 'start' }} onClick={() => setName(randomName())}>
          {t('login.shuffle')}
        </Button>

        <Button block onClick={start}>
          {t('login.start')}
        </Button>

        <p className="login-hint">{t('login.demoHintStart')}</p>
      </div>

      <p className="login-footer">{t('login.footer')}</p>
    </div>
  )
}

/** http 模式：Supabase Auth 邮箱登录/注册（A0b）。 */
function AuthLogin() {
  const login = useDemoStore((s) => s.login)
  const navigate = useNavigate()
  const [tab, setTab] = useState<'login' | 'register'>('register')
  const [email, setEmail] = useState('')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!email || !password || (tab === 'register' && !nickname)) {
      setError(t('login.errorMissingFields'))
      return
    }
    if (tab === 'register' && password.length < 6) {
      setError(t('login.errorWeakPassword'))
      return
    }
    setBusy(true)
    setError(null)

    try {
      if (isHttpMode) {
        // 真实 Auth：注册含昵称；登录态由 Supabase session 持有
        const user =
          tab === 'register'
            ? await register(email, password, nickname)
            : await authLogin(email, password)
        await initProfile() // 确保 users 表有行（幂等）
        login(user.email, user.nickname, user.id)
      } else {
        // mock：假登录（Demo 备案）
        await new Promise((r) => setTimeout(r, 600))
        login(email, tab === 'register' ? nickname : '小望')
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
        <div className="login-tabs">
          <button
            className={`login-tab ${tab === 'login' ? 'is-on' : ''}`}
            onClick={() => setTab('login')}
          >
            {t('login.tabLogin')}
          </button>
          <button
            className={`login-tab ${tab === 'register' ? 'is-on' : ''}`}
            onClick={() => setTab('register')}
          >
            {t('login.tabRegister')}
          </button>
        </div>

        <label className="field">
          <span>{t('login.email')}</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>

        {tab === 'register' && (
          <label className="field">
            <span>
              {t('login.nickname')} <em>{t('login.nicknameHint')}</em>
            </span>
            <input
              className="input"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </label>
        )}

        <label className="field">
          <span>{t('login.password')}</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            autoComplete="current-password"
          />
        </label>

        {error && <p className="login-error">{error}</p>}

        <Button block disabled={busy} onClick={submit}>
          {busy ? t('login.loading') : tab === 'login' ? t('login.submitLogin') : t('login.submitRegister')}
        </Button>

        <p className="login-hint">{isHttpMode ? '本机 Supabase 模式' : t('login.demoHint')}</p>
      </div>

      <p className="login-footer">{t('login.footer')}</p>
    </div>
  )
}
