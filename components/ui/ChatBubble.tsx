import type { ReactNode } from 'react'
import { AiBadge } from './AiBadge'
import { useTranslations } from 'next-intl'

export interface ChatBubbleProps {
  side: 'me' | 'other'
  variant: 'friend' | 'twin' | 'human'
  isAi: boolean
  label?: string
  children: ReactNode
}

const variantBubbleClasses: Record<ChatBubbleProps['variant'], string> = {
  friend: 'bg-friend', // AI friend: warm pear yellow (07 §7.2)
  twin: 'bg-twin text-[color:var(--color-surface)]', // twin: cool blue
  human: 'bg-human', // the human themselves: mint
}

/** One chat message. AI messages always carry the AiBadge (07 §7.1). */
export function ChatBubble({ side, variant, isAi, label, children }: ChatBubbleProps) {
  const t = useTranslations('common')
  return (
    <div className={`flex flex-col gap-1 ${side === 'me' ? 'items-end' : 'items-start'}`}>
      <div className="flex items-center gap-2">
        {isAi && side === 'other' ? (
          <AiBadge label={variant === 'twin' ? (label ?? t('aiChatting')) : label} />
        ) : null}
        <div
          className={`max-w-[75%] rounded-md border-2 border-text px-3.5 py-2 text-sm shadow-sticker ${variantBubbleClasses[variant]}`}
        >
          {children}
        </div>
        {isAi && side === 'me' ? (
          <AiBadge label={variant === 'twin' ? (label ?? t('aiChatting')) : label} />
        ) : null}
      </div>
    </div>
  )
}
