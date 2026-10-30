import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server'
import { notoSansSC, notoSansTC } from '@/app/fonts'
import { locales, type Locale } from '@/i18n/routing'
import { NavBar } from '@/components/ui/NavBar'
import '../globals.css'

export const metadata: Metadata = {
  title: 'PersonaAI',
  description: 'AI 朋友认识你，社交 Agent 替你找到合得来的人。',
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  if (!locales.includes(locale as Locale)) notFound()
  setRequestLocale(locale)

  const t = await getTranslations({ locale, namespace: 'nav' })
  const messages = await getMessages({ locale })

  return (
    <html lang={locale} className={`${notoSansSC.variable} ${notoSansTC.variable}`}>
      <body className="font-body min-h-dvh">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <NavBar
            items={[
              { href: '/friend', label: t('friend') },
              { href: '/lobby', label: t('lobby') },
              { href: '/history', label: t('history') },
              { href: '/profile', label: t('profile') },
              { href: '/settings', label: t('settings') },
            ]}
          />
          <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
