'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

/** Hum-styled modal. Escape closes; returns focus to the opener on close. */
export function Modal({ open, onClose, title, children }: ModalProps) {
  const t = useTranslations('common')
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      previous?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="hum-card w-full max-w-md p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="mb-3 text-lg font-bold">{title}</h2>
        <div className="text-sm">{children}</div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border-2 border-text bg-surface px-4 py-2 text-sm font-semibold hover:translate-y-[1px]"
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
