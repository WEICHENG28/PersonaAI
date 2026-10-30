'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Card } from '@/components/ui/Card'
import { LoginForm } from '@/components/auth/LoginForm'
import { RiveAvatar } from '@/components/ui/RiveAvatar'

export function LoginTabs() {
  const t = useTranslations('login')
  const [mode, setMode] = useState<'login' | 'register'>('register')

  return (
    <Card className="w-full max-w-sm" tilt="left">
      <div
        role="tablist"
        aria-label={t('title')}
        className="mb-4 grid grid-cols-2 gap-1 rounded-md border-2 border-text bg-surface p-1"
      >
        {(['login', 'register'] as const).map((item) => (
          <button
            key={item}
            role="tab"
            type="button"
            aria-selected={mode === item}
            onClick={() => setMode(item)}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
              mode === item ? 'bg-friend' : 'hover:bg-bg'
            }`}
          >
            {item === 'login' ? t('tabLogin') : t('tabRegister')}
          </button>
        ))}
      </div>
      <LoginForm mode={mode} />
    </Card>
  )
}

export function LoginBird() {
  const t = useTranslations('login')
  return (
    <figure className="flex max-w-xs flex-col items-center gap-2 text-center">
      <RiveAvatar src="/riv/red_birdie.riv" name={t('birdCaption')} size="lg" />
      <figcaption className="text-xs text-muted">{t('birdCaption')}</figcaption>
    </figure>
  )
}
