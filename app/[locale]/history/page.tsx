import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Card } from '@/components/ui/Card'

/** /history — B 線的歷史嘗試。Skeleton page. */
export default async function HistoryPage({
  params: { locale },
}: {
  params: { locale: string }
}) {
  setRequestLocale(locale)
  const t = await getTranslations('history')

  return (
    <div className="flex flex-col gap-4 py-8">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted">{t('subtitle')}</p>
      </header>
      <Card className="text-center">
        <p className="text-sm text-muted">{t('empty')}</p>
      </Card>
    </div>
  )
}
