import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@components/ui/Button'
import { RiveAvatar } from '@components/ui/RiveAvatar'
import { ShuffleIcon } from '@components/ui/Icons'
import { useDemoStore } from '@store/useDemoStore'
import { t } from '@i18n/t'
import { isHttpMode, loginAnonymously, initProfile } from '@lib/api/friend'
import { randomName } from './randomName'

/**
 * 画面 1：只要用户名称（随机预填），什么都不打也能直接开始。
 * http 模式用 Supabase 匿名登录建真帐号；mock 模式假登录。
 *
 * 桌机：左＝chromabot Rive 头像（大）；右＝PersonaAI 标题 + 副标题 + 登录卡。
 * 手机：上＝chromabot（登录卡稍微遮住底部）；中＝登录卡；下＝副标题。
 */
export function LoginPage() {
  const login = useDemoStore((s) => s.login)
  const navigate = useNavigate()
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
        await initProfile()
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
      {/* 左（桌机）/ 上（手机）：chromabot 头像 */}
      <div className="login-avatar-area">
        <RiveAvatar name="chromabot" size={280} className="login-bot" />
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
          <label className="field">
            <span>{t('login.username')}</span>
            <div className="login-name-row">
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !busy && start()}
                maxLength={20}
              />
              <button
                type="button"
                className="knob knob--icon"
                onClick={() => setName(randomName())}
                title={t('login.shuffle')}
                aria-label={t('login.shuffle')}
              >
                <ShuffleIcon size={20} />
              </button>
            </div>
          </label>

          {error && <p className="login-error">{error}</p>}

          <Button block disabled={busy} onClick={start}>
            {busy ? t('login.loading') : t('login.start')}
          </Button>
        </div>

        {/* 手机专用：副标题在卡片下方 */}
        <p className="login-sub-mobile">{t('login.subtitle')}</p>
      </div>
    </div>
  )
}
