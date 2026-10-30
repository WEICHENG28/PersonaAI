import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@components/ui/Button'
import { RiveAvatar } from '@components/ui/RiveAvatar'
import { useDemoStore } from '@store/useDemoStore'
import { t } from '@i18n/t'

/** 画面 1：登录/注册（假登录，任填即过） */
export function LoginPage() {
  const login = useDemoStore((s) => s.login)
  const navigate = useNavigate()
  const [tab, setTab] = useState<'login' | 'register'>('register')
  const [email, setEmail] = useState('')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = () => {
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
    setTimeout(() => {
      login(email, tab === 'register' ? nickname : '小望')
      navigate('/friend', { replace: true })
    }, 600)
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
            autoComplete="current-password"
          />
        </label>

        {error && <p className="login-error">{error}</p>}

        <Button block disabled={busy} onClick={submit}>
          {busy ? t('login.loading') : tab === 'login' ? t('login.submitLogin') : t('login.submitRegister')}
        </Button>

        <p className="login-hint">{t('login.demoHint')}</p>
      </div>

      <p className="login-footer">{t('login.footer')}</p>
    </div>
  )
}
