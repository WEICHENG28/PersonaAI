import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Card } from '@/components/ui/Card'
import { RiveAvatar } from '@/components/ui/RiveAvatar'
import { AiBadge } from '@/components/ui/AiBadge'
import { ChatBubble } from '@/components/ui/ChatBubble'
import { Button } from '@/components/ui/Button'
import { FriendInput } from '@/components/friend/FriendInput'

/** /friend — AI friend chat page (home). Skeleton: header, empty state, input. */
export default async function FriendPage({
  params: { locale },
}: {
  params: { locale: string }
}) {
  setRequestLocale(locale)
  const t = await getTranslations('friend')

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <RiveAvatar src="/riv/robot.riv" name={t('title')} size="lg" />
        <div className="flex flex-col">
          <h1 className="flex items-center gap-2 text-xl font-extrabold">
            {t('title')} <AiBadge />
          </h1>
          <p className="text-xs text-muted">{t('subtitle')}</p>
        </div>
        <div className="ml-auto flex flex-col items-end gap-1">
          <Button variant="secondary" size="sm" disabled title={t('nextMeetHint')}>
            {t('nextMeet')}
          </Button>
          <span className="text-[10px] text-muted">{t('nextMeetHint')}</span>
        </div>
      </header>

      {/* 訊息列表（A2 接上 Realtime 訂閱 friend_messages） */}
      <section
        aria-label={t('title')}
        className="hum-card flex min-h-64 flex-col justify-end gap-3 p-4"
      >
        <ChatBubble side="other" variant="friend" isAi>
          {t('empty')}
        </ChatBubble>
      </section>

      <FriendInput placeholder={t('inputPlaceholder')} sendLabel={t('send')} disabledLabel={t('sendDisabled')} />
    </div>
  )
}
