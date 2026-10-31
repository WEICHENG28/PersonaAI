import type { ReactNode } from 'react'
import { Chip } from './Button'
import { t } from '@i18n/t'

export type Speaker = 'friend' | 'twin' | 'human' | 'other-twin'

interface ChatBubbleProps {
  speaker: Speaker
  children: ReactNode
  /** AI 标记（每则 AI 讯息只挂一个小「AI」，UX #31） */
  aiChatting?: boolean
  /** 隐私改写标记 */
  privacyRewrite?: boolean
  privacyTip?: string
  roundTag?: string
}

const speakerClass: Record<Speaker, string> = {
  friend: 'bubble--friend',
  twin: 'bubble--twin',
  human: 'bubble--human',
  'other-twin': 'bubble--other-twin',
}

/** 聊天气泡：朋友梨黄 / 分身蓝 / 本人薄荷，AI 一律挂徽章（产品原则 1） */
export function ChatBubble({
  speaker,
  children,
  aiChatting,
  privacyRewrite,
  privacyTip,
  roundTag,
}: ChatBubbleProps) {
  return (
    <div className={`bubble ${speakerClass[speaker]}`}>
      {roundTag && <span className="bubble__round">{roundTag}</span>}
      <div className="bubble__body">{children}</div>
      {(aiChatting || privacyRewrite) && (
        <div className="bubble__marks">
          {aiChatting && <Chip tone="ink">{t('common.aiBadge')}</Chip>}
          {privacyRewrite && <Chip tone="mint">{privacyTip ?? '隐私改写'}</Chip>}
        </div>
      )}
    </div>
  )
}
