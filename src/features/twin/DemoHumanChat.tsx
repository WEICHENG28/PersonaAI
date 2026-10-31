import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ChatBubble } from '@components/ui/ChatBubble'
import { Button, Chip } from '@components/ui/Button'
import { Card } from '@components/ui/Card'
import { useDemoStore } from '@store/useDemoStore'
import { useAutoScrollBottom } from '@hooks/useAutoScrollBottom'
import { t } from '@i18n/t'

/** mock：网址 id → 对方名字（大厅「我自己聊」、历史「本人去聊」） */
export const DEMO_HUMAN_CHAT_IDS: Record<string, string> = { chen: '陈岭', zhou: '周予安' }

/** mock 模式的本人聊天（UX #14、#15）：你以本人身份开聊，对方暂由分身代答，每则都标示。 */
export function DemoHumanChat({ chatId }: { chatId: string }) {
  const navigate = useNavigate()
  const name = DEMO_HUMAN_CHAT_IDS[chatId]
  const messages = useDemoStore((s) => (name ? s.humanChats[name] : undefined)) ?? []
  const sendHumanChat = useDemoStore((s) => s.sendHumanChat)
  const [draft, setDraft] = useState('')
  const chatRef = useAutoScrollBottom<HTMLDivElement>(messages.length)

  if (!name) {
    return (
      <div className="page">
        <div className="page-head">
          <h1>{t('notFound.title')}</h1>
          <p>{t('notFound.description')}</p>
        </div>
        <Button onClick={() => navigate('/lobby')}>{t('nav.lobby')}</Button>
      </div>
    )
  }

  const send = () => {
    if (!draft.trim()) return
    sendHumanChat(name, draft.trim())
    setDraft('')
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('proxyChat.withWho', { name })}</h1>
        <p>
          <Chip tone="mint">{t('proxyChat.selfInControl')}</Chip>
        </p>
      </div>
      <Card className="friend-chat friend-chat--proxy">
        <div className="friend-chat__head">
          <span className="twin-tag twin-tag--mine">{t('proxyChat.viaSelf')}</span>
          <span className="twin-tag twin-tag--other">{t('proxyChat.viaOtherTwin')}</span>
        </div>
        <div className="chat" ref={chatRef}>
          <p className="chat-note">你以本人身份开聊；对方本人不在线时，由对方的分身先回你（会标示 AI）。</p>
          {messages.map((m) => (
            <ChatBubble
              key={m.id}
              speaker={m.speaker}
              aiChatting={m.speaker === 'other-twin'}
              roundTag={m.speaker === 'other-twin' ? t('proxyChat.viaOtherTwin') : undefined}
            >
              {m.text}
            </ChatBubble>
          ))}
        </div>
        <div className="chat-input">
          <input
            className="input"
            placeholder="以本人身份说点什么…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && send()}
          />
          <Button small onClick={send} disabled={!draft.trim()}>
            {t('friend.send')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
