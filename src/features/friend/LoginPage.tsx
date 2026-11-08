import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@components/ui/Button'
import { RiveAvatar } from '@components/ui/RiveAvatar'
import { ShuffleIcon } from '@components/ui/Icons'
import { useDemoStore } from '@store/useDemoStore'
import { t } from '@i18n/t'
import { currentUser, isHttpMode, initProfile } from '@lib/api/friend'
import { GUEST_KEEP_DAYS, enterAsGuest, lastUsedName, loginAccount, registerAccount, lastGuestName } from '@lib/api/account'
import { randomName } from './randomName'

type Mode = 'guest' | 'login' | 'register'

const TABS: { mode: Mode; label: string }[] = [
  { mode: 'guest', label: '游客体验' },
  { mode: 'login', label: '登录' },
  { mode: 'register', label: '注册' },
]

const hintStyle = { color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }

/**
 * 画面 1：三种进入方式
 * - 游客体验（默认）：和原本一样只要名字，随机预填、可以自己改，不用密码。评审或想先看看的人用。
 *   游客资料保留 GUEST_KEEP_DAYS 天；想留下来到「设置」设密码就变正式帐号。
 * - 登录／注册：名字＋密码。这个浏览器之前用过名字登录，就默认「登录」并填好名字。
 * 这个浏览器已经登录过就直接进入。mock 模式：任何按钮都是假登录。
 *
 * 桌机：左＝chromabot Rive 头像（大）；右＝PersonaAI 标题 + 副标题 + 登录卡。
 * 手机：上＝chromabot（登录卡稍微遮住底部）；中＝登录卡；下＝副标题。
 */
export function LoginPage() {
  const login = useDemoStore((s) => s.login)
  const navigate = useNavigate()
  const [remembered] = useState(() => (isHttpMode ? lastUsedName() : null))
  const [mode, setMode] = useState<Mode>(remembered ? 'login' : 'guest')
  // 游客名字：这个浏览器上次当过游客就预填那个名字（打同名会回到原游客帐号）；否则随机预填。
  // 没改过的随机名字＝后端保证不重复；自己打的（或上次的）＝同名游客就回到那个帐号，正式帐号的名字会被挡下
  const [lastGuest] = useState(() => (isHttpMode ? lastGuestName() : null))
  const [guestName, setGuestName] = useState(() => lastGuest ?? randomName())
  const [guestTyped, setGuestTyped] = useState(Boolean(lastGuest))
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
    if (mode === 'guest') {
      const nickname = guestName.trim() || randomName()
      return void run(() => enterAsGuest(nickname, !guestTyped), nickname)
    }
    const nickname = name.trim()
    if (isHttpMode) {
      if (!nickname) return setError('请输入名字')
      if (!password) return setError('请输入密码')
      if (mode === 'register' && password !== password2) return setError('两次输入的密码不一样')
    }
    void run(() => (mode === 'login' ? loginAccount(nickname, password) : registerAccount(nickname, password)), nickname || randomName())
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setPassword2('')
  }

  const onEnter = (e: React.KeyboardEvent) => e.key === 'Enter' && !busy && submit()

  const shuffleButton = (onClick: () => void) => (
    <button type="button" className="knob knob--icon" onClick={onClick} title={t('login.shuffle')} aria-label={t('login.shuffle')}>
      <ShuffleIcon size={20} />
    </button>
  )

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
          <div className="login-tabs" role="tablist" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {TABS.map((tab) => (
              <button
                key={tab.mode}
                type="button"
                role="tab"
                aria-selected={mode === tab.mode}
                className={`login-tab ${mode === tab.mode ? 'is-on' : ''}`}
                onClick={() => switchMode(tab.mode)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {mode === 'guest' ? (
            <>
              <label className="field">
                <span>{t('login.username')}</span>
                <div className="login-name-row">
                  <input
                    className="input"
                    value={guestName}
                    onChange={(e) => {
                      setGuestName(e.target.value)
                      setGuestTyped(true)
                    }}
                    onKeyDown={onEnter}
                    maxLength={20}
                  />
                  {shuffleButton(() => {
                    setGuestName(randomName())
                    setGuestTyped(false)
                  })}
                </div>
              </label>
              {isHttpMode && (
                <p style={hintStyle}>
                  不用密码，马上体验完整流程。游客记录保留 {GUEST_KEEP_DAYS} 天，期间换浏览器或登出后输入同样的名字就能回来；别人输入同样的名字也进得去，想保护记录请到「设置」设一个密码。
                </p>
              )}
            </>
          ) : (
            <>
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
                  {mode === 'register' && shuffleButton(() => setName(randomName()))}
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
            </>
          )}

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <Button block disabled={busy} onClick={submit}>
            {busy ? t('login.loading') : mode === 'guest' ? t('login.start') : mode === 'login' ? '登录' : '注册并开始'}
          </Button>
        </div>

        {/* 手机专用：副标题在卡片下方 */}
        <p className="login-sub-mobile">{t('login.subtitle')}</p>
      </div>
    </div>
  )
}
