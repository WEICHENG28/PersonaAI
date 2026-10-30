import { useTranslations } from 'next-intl'

export interface AiBadgeProps {
  /** Extra label, e.g. "AI 代聊中" for twin messages (07 §7.1) */
  label?: string
}

/**
 * Sticker badge marking AI-generated content. Every AI message shows it —
 * no exceptions, no emoji (07 §8.1).
 */
export function AiBadge({ label }: AiBadgeProps) {
  const t = useTranslations('common')
  return (
    <span className="hum-sticker text-text" title={label}>
      {t('aiBadge')}
      {label ? <span className="font-normal">｜{label}</span> : null}
    </span>
  )
}
