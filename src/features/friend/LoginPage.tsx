import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@components/ui/Button'
import { RiveAvatar } from '@components/ui/RiveAvatar'
import { ShuffleIcon } from '@components/ui/Icons'
import { useDemoStore } from '@store/useDemoStore'
import { t } from '@i18n/t'
import { currentUser, isHttpMode, initProfile } from '@lib/api/friend'
import { enterAsGuest, lastUsedName, loginAccount, registerAccount } from '@lib/api/account'
import { randomName } from './randomName'

type Mode = 'login' | 'register'

const hintStyle = { color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }

/**
 * 画面 1：登录／注册（名字＋密码），或「游客体验」一键进入（评审、想先看看的人用）。
 * 游客之后可以在「设置」设密码，变成正式帐号，记录都保留。这个浏览器已经登录过就直接进入。
 * mock 模式：任何按钮都是假登录。
 *
 * 桌机：左＝chromabot Rive 头像（大）；右＝PersonaAI 标题 + 副标题 + 登录卡。
 * 手机：上＝chromabot（登录卡稍微遮住底部）；中＝登录卡；下＝副标题。
 */
export function LoginPage() {
  const login = useDemoStore((s) => s.login)
  const navigate = useNavigate()
  // 这个浏览器上次用的名字：有的话默认「登录」并填入名字
  const [remembered] = useState(() => (isHttpMode ? lastUsedName() : null))
  const [mode, setMode] = useState<Mode>(remembered ? 'login' : 'register')
  const [name, setName] = useState(() => remembered ?? '')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const finish = async () => {
    await initProfile()
    const user = await currentUser()
    if (user) login(user.email, user.nickname, user.id)
    navigate('/friend', { replace: true })
  }

  // 这个浏览器已经登录过：直接回到原帐号，不显示登录页
  useEffect(() => {
    if (!isHttpMode) return
    let alive = true
    currentUser()
      .then((user) => {
        if (alive && user) void finish()
      })
      .catch(() => {})
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const run = async (action: () => Promise<unknown>, mockName: string) => {
    setBusy(true)
    setError(null)
    try {
      if (isHttpMode) {
        await action()
        await finish()
      } else {
        login('', mockName)
        navigate('/friend', { replace: true })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('login.errorGeneric'))
    } finally {
      setBusy(false)
    }
  }

  const submit = () => {
    const nickname = name.trim()
    if (isHttpMode) {
      if (!nickname) return setError('请输入名字')
      if (!password) return setError('请输入密码')
      if (mode === 'register' && password !== password2) return setError('两次输入的密码不一样')
    }
    void run(() => (mode === 'login' ? loginAccount(nickname, password) : registerAccount(nickname, password)), nickname || randomName())
  }

  const guest = () => void run(() => enterAsGuest(randomName()), randomName())

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setPassword2('')
  }

  const onEnter = (e: React.KeyboardEvent) => e.key === 'Enter' && !busy && submit()

  return (
    <div className="login-page">
      {/* 左（桌机）/ 上（手机）：chromabot 头像（占屏幕高度 60%） */}
      <div className="login-avatar-area">
        <RiveAvatar name="chromabot" fill className="login-bot" />
      </div>

      {/* 右（桌机）/ 下（手机）：品牌 + 登录卡 */}
      <div className="login-right">
        {/* 桌机：标题 + 副标题（手机隐藏，副标题移到卡片下方） */}
        <div className="login-brand">
          <h1>{t('login.title')}</h1>
          <p className="login-brand-sub">{t('login.subtitle')}</p>
        </div>

        {/* 登录卡 */}
        <div className="login-card card">
          <div className="login-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'login'} className={`login-tab ${mode === 'login' ? 'is-on' : ''}`} onClick={() => switchMode('login')}>
              登录
            </button>
            <button type="button" role="tab" aria-selected={mode === 'register'} className={`login-tab ${mode === 'register' ? 'is-on' : ''}`} onClick={() => switchMode('register')}>
              注册
            </button>
          </div>

          <label className="field">
            <span>{t('login.username')}</span>
            <div className="login-name-row">
              <input
                className="input"
                value={name}
                placeholder={mode === 'register' ? '取一个名字，别人会看到' : '你注册时用的名字'}
                autoComplete="username"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={onEnter}
                maxLength={20}
              />
              {mode === 'register' && (
                <button type="button" className="knob knob--icon" onClick={() => setName(randomName())} title={t('login.shuffle')} aria-label={t('login.shuffle')}>
                  <ShuffleIcon size={20} />
                </button>
              )}
            </div>
          </label>

          <label className="field">
            <span>密码</span>
            <input
              className="input"
              type="password"
              value={password}
              placeholder={mode === 'register' ? '至少 6 个字' : ''}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={onEnter}
              maxLength={64}
            />
          </label>

          {mode === 'register' && (
            <label className="field">
              <span>再输入一次密码</span>
              <input className="input" type="password" value={password2} autoComplete="new-password" onChange={(e) => setPassword2(e.target.value)} onKeyDown={onEnter} maxLength={64} />
            </label>
          )}

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <Button block disabled={busy} onClick={submit}>
            {busy ? t('login.loading') : mode === 'login' ? '登录' : '注册并开始'}
          </Button>

          {/* 游客：评审或只想先看看的人，一键进入完整流程 */}
          <div style={{ display: 'grid', gap: 'var(--space-2xs)', borderTop: '1px solid var(--color-rule)', paddingTop: 'var(--space-md)' }}>
            <Button block variant="secondary" disabled={busy} onClick={guest}>
              游客体验（不用注册）
            </Button>
            <p style={hintStyle}>马上体验完整流程。想保留记录的话，之后到「设置」设一个密码就好。</p>
          </div>
        </div>

        {/* 手机专用：副标题在卡片下方 */}
        <p className="login-sub-mobile">{t('login.subtitle')}</p>
      </div>
    </div>
  )
}
