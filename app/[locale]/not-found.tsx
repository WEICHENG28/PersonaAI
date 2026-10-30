import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Card } from '@/components/ui/Card'

export default function NotFoundPage() {
  const t = useTranslations('notFound')

  return (
    <div className="flex flex-col items-center gap-5 py-16">
      <Card tilt="left" className="max-w-md text-center">
        <h1 className="mb-2 text-xl font-extrabold">{t('title')}</h1>
        <p className="mb-5 text-sm text-muted">{t('description')}</p>
        <Link
          href="/friend"
          className="inline-block rounded-md border-2 border-text bg-friend px-4 py-2 text-sm font-semibold shadow-sticker transition-transform hover:translate-y-[1px]"
        >
          {t('back')}
        </Link>
      </Card>
    </div>
  )
}
