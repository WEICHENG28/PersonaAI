'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { loginAction, registerAction, type AuthResult } from '@/lib/auth/actions'
import { SubmitButton } from '@/components/ui/SubmitButton'

type Mode = 'login' | 'register'

const initialResult: AuthResult = { ok: true }

export function LoginForm({ mode }: { mode: Mode }) {
  const t = useTranslations('login')
  const router = useRouter()
  const [result, setResult] = useState<AuthResult>(initialResult)
  const [isPending, startTransition] = useTransition()
  const action = mode === 'login' ? loginAction : registerAction
  const isRegister = mode === 'register'

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      const response = await action(formData)
      if (response.ok) {
        // Middleware 保證已登入者直接進 /friend
        router.replace('/friend')
      } else {
        setResult(response)
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {isRegister ? (
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('nickname')}
          <input
            name="nickname"
            required
            maxLength={20}
            aria-describedby="nickname-hint"
            className="rounded-md border-2 border-text bg-surface px-3 py-2 text-sm font-normal"
          />
          <span id="nickname-hint" className="text-xs font-normal text-muted">
            {t('nicknameHint')}
          </span>
        </label>
      ) : null}

      <label className="flex flex-col gap-1 text-sm font-semibold">
        {t('email')}
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-md border-2 border-text bg-surface px-3 py-2 text-sm font-normal"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-semibold">
        {t('password')}
        <input
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          className="rounded-md border-2 border-text bg-surface px-3 py-2 text-sm font-normal"
        />
      </label>

      {!result.ok ? (
        <p role="alert" className="rounded-md border-2 border-warning bg-warning/10 px-3 py-2 text-sm">
          {t(result.error)}
        </p>
      ) : null}

      <SubmitButton type="submit" pending={isPending} pendingLabel={t('loading')}>
        {isRegister ? t('submitRegister') : t('submitLogin')}
      </SubmitButton>
    </form>
  )
}
