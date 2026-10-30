import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Card } from '@/components/ui/Card'
import { RiveAvatar } from '@/components/ui/RiveAvatar'

/** /lobby — C 線的大廳。Skeleton: heading + fish placeholder + empty card. */
export default async function LobbyPage({
  params: { locale },
}: {
  params: { locale: string }
}) {
  setRequestLocale(locale)
  const t = await getTranslations('lobby')

  return (
    <div className="flex flex-col items-center gap-6 py-10">
      <header className="flex flex-col items-center gap-2 text-center">
        <RiveAvatar src="/riv/fish.riv" name={t('title')} size="lg" />
        <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        <p className="max-w-md text-sm text-muted">{t('subtitle')}</p>
      </header>
      <Card tilt="right" className="max-w-md text-center">
        <p className="text-sm text-muted">{t('empty')}</p>
      </Card>
    </div>
  )
}
