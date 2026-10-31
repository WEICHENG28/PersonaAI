import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@components/ui/Button'
import { RiveAvatar } from '@components/ui/RiveAvatar'
import { ShuffleIcon } from '@components/ui/Icons'
import { useDemoStore } from '@store/useDemoStore'
import { t } from '@i18n/t'
import { currentUser, isHttpMode, initProfile } from '@lib/api/friend'
import { NameExistsError, enterWithName } from '@lib/api/account'
import { randomName } from './randomName'

/**
 * 画面 1：只要用户名称（随机预填），什么都不打也能直接开始。
 * http 模式是「名字帐号」：自己打的名字下次再打一样的就回到同一个帐号（名字已有帐号会先问是不是你）；
 * 没改过的随机名字一定不和别人重复。这个浏览器已经登录过就直接进入。mock 模式假登录。
 *
 * 桌机：左＝chromabot Rive 头像（大）；右＝PersonaAI 标题 + 副标题 + 登录卡。
 * 手机：上＝chromabot（登录卡稍微遮住底部）；中＝登录卡；下＝副标题。
 */
export function LoginPage() {
  const login = useDemoStore((s) => s.login)
  const navigate = useNavigate()
  const [name, setName] = useState(randomName)
  // 用户自己改过名字＝用这个名字（找回或新建）；没改过＝随机名字（保证不重复）
  const [typed, setTyped] = useState(false)
  const [existsName, setExistsName] = useState<string | null>(null)
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

  const start = async (confirmExisting = false) => {
    const nickname = name.trim() || randomName()
    setBusy(true)
    setError(null)
    try {
      if (isHttpMode) {
        await enterWithName(typed ? 'name' : 'random', nickname, confirmExisting)
        setExistsName(null)
        await finish()
      } else {
        login('', nickname)
        navigate('/friend', { replace: true })
      }
    } catch (e) {
      if (e instanceof NameExistsError) setExistsName(e.displayName)
      else setError(e instanceof Error ? e.message : t('login.errorGeneric'))
    } finally {
      setBusy(false)
    }
  }

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
          <label className="field">
            <span>{t('login.username')}</span>
            <div className="login-name-row">
              <input
                className="input"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setTyped(true)
                  setExistsName(null)
                }}
                onKeyDown={(e) => e.key === 'Enter' && !busy && start()}
                maxLength={20}
              />
              <button
                type="button"
                className="knob knob--icon"
                onClick={() => {
                  setName(randomName())
                  setTyped(false)
                  setExistsName(null)
                }}
                title={t('login.shuffle')}
                aria-label={t('login.shuffle')}
              >
                <ShuffleIcon size={20} />
              </button>
            </div>
          </label>

          {isHttpMode && <p className="login-hint" style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>想之后继续用同一个帐号，请记住你的名字，下次输入一样的名字就会回到原来的记录。</p>}

          {existsName && (
            <div className="login-exists" role="alert" style={{ display: 'grid', gap: 'var(--space-sm)' }}>
              <p>「{existsName}」已经有帐号了。是你的话可以直接进入，之前的记录都会在；不是的话请换一个名字。</p>
              <Button block disabled={busy} onClick={() => start(true)}>
                是我，进入「{existsName}」
              </Button>
              <Button
                block
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setName(randomName())
                  setTyped(false)
                  setExistsName(null)
                }}
              >
                不是我，换一个名字
              </Button>
            </div>
          )}

          {error && <p className="login-error">{error}</p>}

          <Button block disabled={busy || Boolean(existsName)} onClick={() => start()}>
            {busy ? t('login.loading') : t('login.start')}
          </Button>
        </div>

        {/* 手机专用：副标题在卡片下方 */}
        <p className="login-sub-mobile">{t('login.subtitle')}</p>
      </div>
    </div>
  )
}
