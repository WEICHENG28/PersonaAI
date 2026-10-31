// 送出前的隱私警告：訊息裡有微信號、手機號、身份證、地址等，先跳出顯眼的提醒讓用戶三思。
// 用法：const { guard, dialog } = usePrivacyCheck('human')；送出時 guard(text, () => 真的送出)，畫面放 {dialog}。
// 只提醒、不擋：用戶確定後照常送出（和真人聊天時，後端不會再遮蔽本人親手打的字）。
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Button } from '@components/ui/Button'
import { detectPrivacy } from '@lib/privacy/rules'

/** human＝訊息會直接被對方看到；friend＝和 AI 朋友聊，會被記住。 */
export type PrivacyAudience = 'human' | 'friend'

interface Pending {
  hits: string[]
  proceed: () => void
}

export function usePrivacyCheck(audience: PrivacyAudience): { guard: (text: string, proceed: () => void) => void; dialog: ReactNode } {
  const [pending, setPending] = useState<Pending | null>(null)

  const guard = useCallback((text: string, proceed: () => void) => {
    const hits = detectPrivacy(text)
    if (hits.length === 0) proceed()
    else setPending({ hits, proceed })
  }, [])

  const cancel = useCallback(() => setPending(null), [])
  const confirm = useCallback(() => {
    const next = pending
    setPending(null)
    next?.proceed()
  }, [pending])

  const dialog = pending ? <PrivacyWarningDialog hits={pending.hits} audience={audience} onCancel={cancel} onConfirm={confirm} /> : null
  return { guard, dialog }
}

const WHO_SEES: Record<PrivacyAudience, string> = {
  human: '这条消息会直接被对方看到，发出去就收不回来了。',
  friend: '阿澈会记住你说的话。和 AI 聊天也尽量不要留下证件号、密码这类资料。',
}

const TIPS = [
  '刚认识的人还不了解，先别急着给联系方式、住址或证件号。',
  '对方要你转账、给验证码或密码，一定是骗局。',
  '想交换联系方式，可以多聊几次、确认对方可信再说。',
]

interface DialogProps {
  hits: string[]
  audience: PrivacyAudience
  onCancel: () => void
  onConfirm: () => void
}

function PrivacyWarningDialog({ hits, audience, onCancel, onConfirm }: DialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="modal-scrim" onClick={onCancel} role="presentation">
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="privacy-warning-title"
        onClick={(e) => e.stopPropagation()}
        style={{ border: '3px solid var(--color-error)' }}
      >
        <header className="modal__head" style={{ background: 'var(--color-error)', color: 'var(--color-white)' }}>
          <h2 id="privacy-warning-title" className="modal__title">
            先停一下：这条消息可能包含个人隐私
          </h2>
        </header>
        <div className="modal__body stack">
          <p>
            检测到：<strong style={{ color: 'var(--color-error)' }}>{hits.join('、')}</strong>
          </p>
          <p>{WHO_SEES[audience]}</p>
          <ul className="suggest-list">
            {TIPS.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>
        <footer className="modal__foot">
          <Button autoFocus onClick={onCancel}>
            返回修改
          </Button>
          <Button variant="secondary" onClick={onConfirm}>
            我确定，仍要发送
          </Button>
        </footer>
      </div>
    </div>
  )
}
