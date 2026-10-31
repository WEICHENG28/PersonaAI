// C4 聊天室（http 模式，真资料）。版面沿用 A 做好的代聊页（friend-layout／friend-chat／verdict-live），只换资料来源。拥有者：C。
// C6：按「我来聊」→ 本人接手 → 先显示接手卡片，按「开始由本人聊」关闭后就能输入。
// C7：对方是分身时可以「请求真人」；从通知铃铛选「现在聊」过来时，接手卡片也放在路由 state。
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ChatBubble } from '@components/ui/ChatBubble'
import { Button, Chip } from '@components/ui/Button'
import { Card } from '@components/ui/Card'
import { useAutoScrollBottom } from '@hooks/useAutoScrollBottom'
import { t } from '@i18n/t'
import type { ChatRoomView, TakeoverView } from '@lib/api/twin'
import {
  CHAT_TEXT,
  canRequestHuman,
  canType,
  placeholderOf,
  sideLabel,
  speakerOf,
  statusChip,
  verdictText,
} from './chatRoomView'
import { usePrivacyCheck } from '@components/PrivacyWarning'
import { HandoffCard } from './HandoffCard'
import { HANDOFF_TEXT, readHandoffState, takeoverBlockOf } from './handoffView'
import { useChatRoom, type ChatRoomState } from './useChatRoom'

interface LiveChatRoomProps {
  conversationId: string
}

export function LiveChatRoom({ conversationId }: LiveChatRoomProps) {
  const state = useChatRoom(conversationId)
  const navigate = useNavigate()
  const location = useLocation()
  // 从结果页接手过来时，接手卡片放在路由 state 里
  const [handoff, setHandoff] = useState<TakeoverView | null>(() => readHandoffState(location.state, conversationId))
  // 已经在这个聊天室时从铃铛选「现在聊」：网址不变、元件不重建，要另外接住新的路由 state
  useEffect(() => {
    const view = readHandoffState(location.state, conversationId)
    if (view) setHandoff(view)
  }, [location.state, conversationId])

  const closeHandoff = () => {
    setHandoff(null)
    // 清掉路由 state，重新整理时不会再跳出卡片
    if (location.state) navigate(location.pathname, { replace: true, state: null })
  }
  const startTakeOver = async () => {
    const view = await state.takeOver()
    if (view) setHandoff(view)
  }

  if (handoff) return <HandoffCard view={handoff} onStart={closeHandoff} />
  if (!state.room) {
    return (
      <div className="page">
        {state.loadError ? (
          <Card className="stack">
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
  return <ChatRoomBody room={state.room} state={state} onTakeOver={() => void startTakeOver()} />
}

interface ChatRoomBodyProps {
  room: ChatRoomView
  state: ChatRoomState
  onTakeOver(): void
}

function ChatRoomBody({ room, state, onTakeOver }: ChatRoomBodyProps) {
  const [draft, setDraft] = useState('')
  const chatRef = useAutoScrollBottom<HTMLDivElement>(room.messages.length + (state.twinTyping ? 1 : 0))
  const typable = canType(room)
  const chip = statusChip(room.status)
  const anyTwin = room.me.controller === 'twin' || room.other.controller === 'twin'
  const notice = state.notice ?? state.loadError

  // 送出前檢查隱私：和真人聊天，訊息會直接被對方看到
  const privacy = usePrivacyCheck('human')
  const send = () => {
    const text = draft.trim()
    if (!text || state.sending) return
    privacy.guard(text, () => {
      void state.send(text).then((ok) => ok && setDraft(''))
    })
  }

  return (
    <div className="page">
      {privacy.dialog}
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
              onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && send()}
              disabled={!typable || state.sending}
            />
            <Button small onClick={send} disabled={!typable || state.sending || !draft.trim()}>
              {CHAT_TEXT.send}
            </Button>
          </div>
        </Card>

        <ChatActions room={room} state={state} onTakeOver={onTakeOver} />
      </div>
    </div>
  )
}

interface ChatActionsProps {
  room: ChatRoomView
  state: ChatRoomState
  onTakeOver(): void
}

/** 「我来聊」（C6，接手后就消失，不能交回分身）、「请求真人」（C7，对方是分身时）、「查看结果」（C5）。 */
function ChatActions({ room, state, onTakeOver }: ChatActionsProps) {
  const navigate = useNavigate()
  return (
    <div className="friend-side stack">
      {takeoverBlockOf(room) === null && (
        <Button block variant="secondary" onClick={onTakeOver} disabled={state.takingOver}>
          {state.takingOver ? HANDOFF_TEXT.taking : CHAT_TEXT.takeOver}
        </Button>
      )}
      {canRequestHuman(room) && (
        <Button
          block
          variant="secondary"
          onClick={() => void state.requestHuman()}
          disabled={state.requestingHuman || state.humanRequested}
        >
          {requestHumanLabel(state)}
        </Button>
      )}
      <Button block onClick={() => navigate(`/chat/${encodeURIComponent(room.conversationId)}/result`)}>
        {CHAT_TEXT.viewResult}
      </Button>
    </div>
  )
}

function requestHumanLabel(state: ChatRoomState): string {
  if (state.requestingHuman) return CHAT_TEXT.requestingHuman
  return state.humanRequested ? CHAT_TEXT.humanRequested : CHAT_TEXT.requestHuman
}
