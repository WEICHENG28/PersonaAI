import { getTranslations, setRequestLocale } from 'next-intl/server'
import { LoginBird, LoginTabs } from '@/components/auth/LoginScreen'

export default async function LoginPage({
  params: { locale },
}: {
  params: { locale: string }
}) {
  setRequestLocale(locale)
  const t = await getTranslations('login')

  return (
    <div className="flex flex-col items-center gap-8 py-10">
      <header className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">{t('title')}</h1>
        <p className="max-w-md text-sm text-muted">{t('subtitle')}</p>
      </header>
      <LoginBird />
      <LoginTabs />
      <footer className="max-w-md text-center text-xs text-muted">{t('footer')}</footer>
    </div>
  )
}
