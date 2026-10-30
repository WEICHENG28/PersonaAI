import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Card } from '@/components/ui/Card'

/** /settings — 設定頁（A7 內嵌 B 的 <SocialSettings/>）。Skeleton page. */
export default async function SettingsPage({
  params: { locale },
}: {
  params: { locale: string }
}) {
  setRequestLocale(locale)
  const t = await getTranslations('settings')

  return (
    <div className="flex flex-col gap-4 py-8">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
      </header>
      <Card>
        <p className="text-sm text-muted">{t('comingSoon')}</p>
      </Card>
    </div>
  )
}
