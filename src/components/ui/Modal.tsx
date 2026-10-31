import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Chip } from './Button'

interface ModalProps {
  open: boolean
  onClose?: () => void
  title?: string
  sub?: string
  children: ReactNode
  footer?: ReactNode
  sheet?: 'pear' | 'paper'
  wide?: boolean
  /** 右上角的 Demo 標籤；真資料的視窗傳 false */
  demo?: boolean
}

/** Hum 卡片式弹窗：纸卡 + 梨黄 sticker 头 */
export function Modal({ open, onClose, title, sub, children, footer, sheet = 'paper', wide, demo = true }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-scrim" onClick={onClose} role="presentation">
      <div
        className={`modal ${sheet === 'pear' ? 'modal--pear' : ''} ${wide ? 'modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <div>
            {title && <h2 className="modal__title">{title}</h2>}
            {sub && <p className="modal__sub">{sub}</p>}
          </div>
          {demo && <Chip tone="well">Demo</Chip>}
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>
  )
}
