// C4 聊天室（http 模式，真资料）。版面沿用 A 做好的代聊页（friend-layout／friend-chat／verdict-live），只换资料来源。拥有者：C。
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ChatBubble } from '@components/ui/ChatBubble'
import { Button, Chip } from '@components/ui/Button'
import { Card } from '@components/ui/Card'
import { useAutoScrollBottom } from '@hooks/useAutoScrollBottom'
import { t } from '@i18n/t'
import type { ChatRoomView } from '@lib/api/twin'
import {
  CHAT_TEXT,
  canType,
  placeholderOf,
  sideLabel,
  speakerOf,
  statusChip,
  verdictText,
} from './chatRoomView'
import { useChatRoom, type ChatRoomState } from './useChatRoom'

interface LiveChatRoomProps {
  conversationId: string
}

export function LiveChatRoom({ conversationId }: LiveChatRoomProps) {
  const state = useChatRoom(conversationId)
  const navigate = useNavigate()

  if (!state.room) {
    return (
      <div className="page">
        {state.loadError ? (
          <Card>
            <h1>{CHAT_TEXT.loadFailedTitle}</h1>
            <p>{state.loadError}</p>
            <Button onClick={() => navigate('/friend')}>{CHAT_TEXT.back}</Button>
          </Card>
        ) : (
          <p className="empty">{t('common.loading')}</p>
        )}
      </div>
    )
  }
  return <ChatRoomBody room={state.room} state={state} />
}

interface ChatRoomBodyProps {
  room: ChatRoomView
  state: ChatRoomState
}

function ChatRoomBody({ room, state }: ChatRoomBodyProps) {
  const [draft, setDraft] = useState('')
  const chatRef = useAutoScrollBottom<HTMLDivElement>(room.messages.length + (state.twinTyping ? 1 : 0))
  const typable = canType(room)
  const chip = statusChip(room.status)
  const anyTwin = room.me.controller === 'twin' || room.other.controller === 'twin'
  const notice = state.notice ?? state.loadError

  const send = async () => {
    const text = draft.trim()
    if (!text || state.sending) return
    if (await state.send(text)) setDraft('')
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('proxyChat.withWho', { name: room.other.name })}</h1>
        <p>
          {chip && <Chip tone="coral">{chip}</Chip>} {!chip && anyTwin && <Chip tone="ink">{t('common.aiChatting')}</Chip>}
        </p>
      </div>

      <div className="friend-layout">
        <Card className="friend-chat">
          <div className="friend-chat__head">
            <span className="twin-tag twin-tag--mine">{sideLabel('mine', room.me.controller)}</span>
            <span className="twin-tag twin-tag--other">{sideLabel('other', room.other.controller)}</span>
          </div>

          <div className="chat" ref={chatRef}>
            {room.messages.length === 0 && <p className="empty">{t('common.loading')}</p>}
            {room.messages.map((m) => (
              <ChatBubble key={m.id} speaker={speakerOf(m, room.me.userId)} aiChatting={m.is_ai} privacyRewrite={m.guard_rewritten}>
                {m.content}
              </ChatBubble>
            ))}
            {state.twinTyping && <div className="typing-dot" aria-label={CHAT_TEXT.typing} />}
          </div>

          {/* 目前判定：只有我方视角的文字与走势，没有分数（02 §F7） */}
          <div className="verdict-live">
            <strong>{CHAT_TEXT.verdictPanel}</strong>
            <p>{verdictText(state.verdict) ?? CHAT_TEXT.verdictWatching}</p>
            {notice && <p role="status">{notice}</p>}
          </div>

          <div className="chat-input">
            <input
              className="input"
              placeholder={placeholderOf(room)}
              value={draft}
              maxLength={1000}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && void send()}
              disabled={!typable || state.sending}
            />
            <Button small onClick={() => void send()} disabled={!typable || state.sending || !draft.trim()}>
              {CHAT_TEXT.send}
            </Button>
          </div>
        </Card>

        <ChatActions room={room} />
      </div>
    </div>
  )
}

/** 「我来聊」（C6）、「请求真人」（C7）、「查看结果」（C5）：对应任务做好前先显示「即将上线」。 */
function ChatActions({ room }: { room: ChatRoomView }) {
  return (
    <div className="friend-side stack">
      {room.me.controller === 'twin' && room.status !== 'ended' && (
        <Button block variant="secondary" disabled title={CHAT_TEXT.comingSoon}>
          {CHAT_TEXT.takeOver} · {CHAT_TEXT.comingSoon}
        </Button>
      )}
      {room.other.controller === 'twin' && room.status !== 'ended' && (
        <Button block variant="secondary" disabled title={CHAT_TEXT.comingSoon}>
          {CHAT_TEXT.requestHuman} · {CHAT_TEXT.comingSoon}
        </Button>
      )}
      <Button block disabled title={CHAT_TEXT.comingSoon}>
        {CHAT_TEXT.viewResult} · {CHAT_TEXT.comingSoon}
      </Button>
    </div>
  )
}
