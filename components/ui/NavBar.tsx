'use client'

import { Link, usePathname } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { LanguageSwitcher } from './LanguageSwitcher'

export interface NavItem {
  href: string
  label: string
}

export function NavBar({ items }: { items: NavItem[] }) {
  const t = useTranslations('nav')
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-40 border-b-2 border-text bg-bg/95 backdrop-blur">
      <nav className="mx-auto flex h-14 w-full max-w-3xl items-center gap-1 px-4" aria-label={t('menuOpen')}>
        <Link href="/friend" className="mr-2 rounded-md px-2 py-1 text-base font-extrabold tracking-tight">
          PersonaAI
        </Link>
        <ul className="flex flex-1 items-center gap-0.5 overflow-x-auto">
          {items.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== '/friend' && pathname.startsWith(`${item.href}/`))
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`inline-block whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-semibold ${
                    active ? 'bg-friend' : 'hover:bg-surface'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
        <div className="flex items-center gap-2">
          {/* C 線 <NotificationBell/> 預留位（C0 後接上） */}
          {/* B 線 <AgentLogPanel/>（dev_mode 開啟時顯示，B7 後接上） */}
          <LanguageSwitcher />
        </div>
      </nav>
    </header>
  )
}
