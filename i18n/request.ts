import { getRequestConfig } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { defaultLocale, locales, type Locale } from './routing'

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale: Locale =
    requested && locales.includes(requested as Locale)
      ? (requested as Locale)
      : defaultLocale

  if (!locales.includes(locale as Locale)) {
    notFound()
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
