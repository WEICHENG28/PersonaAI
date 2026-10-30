import { defineRouting } from 'next-intl/routing'

export const locales = ['zh-CN', 'zh-HK', 'en'] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'zh-CN'

export const localeLabels: Record<Locale, string> = {
  'zh-CN': '简体中文',
  'zh-HK': '廣東話',
  en: 'English',
}

/** zh-CN is the default and lives at unprefixed URLs; zh-HK / en get a prefix. */
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'as-needed',
})
