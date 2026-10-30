'use client'

import { useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'
import { localeLabels, locales, type Locale } from '@/i18n/routing'

/**
 * Switches locale while staying on the current page.
 * zh-CN keeps unprefixed URLs (localePrefix: 'as-needed').
 */
export function LanguageSwitcher() {
  const t = useTranslations('common')
  const locale = useLocale() as Locale
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const onChange = (next: string) => {
    startTransition(() => {
      router.replace(pathname, { locale: next as Locale })
    })
  }

  return (
    <label className="flex items-center gap-1.5 text-xs">
      <span className="sr-only">{t('language')}</span>
      <span aria-hidden className="font-semibold">
        {t('language')}
      </span>
      <select
        value={locale}
        onChange={(event) => onChange(event.target.value)}
        disabled={isPending}
        className="rounded-md border-2 border-text bg-surface px-2 py-1 font-semibold"
      >
        {locales.map((item) => (
          <option key={item} value={item}>
            {localeLabels[item]}
          </option>
        ))}
      </select>
    </label>
  )
}
