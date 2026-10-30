import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Card } from '@/components/ui/Card'

/** /profile — 我的對外檔案與「它記得的事」（A4、A3）。Skeleton page. */
export default async function ProfilePage({
  params: { locale },
}: {
  params: { locale: string }
}) {
  setRequestLocale(locale)
  const t = await getTranslations('profile')

  return (
    <div className="flex flex-col gap-4 py-8">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
      </header>

      <Card>
        <h2 className="mb-1 text-base font-bold">{t('shareable')}</h2>
        <p className="mb-3 text-xs text-muted">{t('shareableNote')}</p>
        <p className="text-sm text-muted">{t('comingSoon')}</p>
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-bold">{t('memories')}</h2>
        <p className="text-sm text-muted">{t('memoriesEmpty')}</p>
      </Card>
    </div>
  )
}
