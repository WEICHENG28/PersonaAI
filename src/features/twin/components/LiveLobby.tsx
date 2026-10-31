// C9／C10 大厅（http 模式，真资料）。版面沿用 A 做好的大厅页（helper-card／lobby-grid／cand-card），只换资料来源。拥有者：C。
// 候选人来自 B 的 searchLobby；卡片和助手回答都没有任何分数数字，AI 预估只有文字。
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, Chip } from '@components/ui/Button'
import { Card } from '@components/ui/Card'
import { RiveAvatar } from '@components/ui/RiveAvatar'
import { TaskConfirmCard } from '@features/social/components/TaskConfirmCard'
import { t } from '@i18n/t'
import {
  askLobbyAssistant,
  getLobby,
  startHumanChat,
  startTwinChat,
  type LobbyAssistantView,
  type LobbyCardView,
} from '@lib/api/twin'
import { errorMessage, FIT_TEXT, FIT_TONE, LOBBY_TEXT } from './lobbyView'
import './lobby.css'

type Action = 'twin' | 'human'

/** 两个按钮共用：同一时间只处理一个，失败时显示在那张卡片上。 */
function useStartChat() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<{ userId: string; text: string } | null>(null)
  const start = useCallback(
    async (userId: string, action: Action) => {
      if (busy) return
      setBusy(userId)
      setError(null)
      try {
        if (action === 'twin') navigate(`/tasks/${(await startTwinChat(userId)).taskId}`)
        else navigate(`/chat/${(await startHumanChat(userId)).conversationId}`)
      } catch (err) {
        setError({ userId, text: errorMessage(err, '刚才没处理成功，请再试一次') })
        setBusy(null)
      }
    },
    [busy, navigate],
  )
  return { busy, error, start }
}

interface CardActionsProps {
  userId: string
  chat: ReturnType<typeof useStartChat>
}

function CardActions({ userId, chat }: CardActionsProps) {
  const isBusy = chat.busy === userId
  return (
    <>
      <div className="lobby-actions">
        <Button small onClick={() => chat.start(userId, 'twin')} disabled={chat.busy !== null}>
          {isBusy ? LOBBY_TEXT.starting : LOBBY_TEXT.twinChat}
        </Button>
        <Button small variant="secondary" onClick={() => chat.start(userId, 'human')} disabled={chat.busy !== null}>
          {LOBBY_TEXT.humanChat}
        </Button>
      </div>
      {chat.error?.userId === userId && (
        <p className="lobby-note" role="alert">
          {chat.error.text}
        </p>
      )}
    </>
  )
}

/** 助手回答下方的候选人小卡片：名字、兴趣、一句介绍＋两个按钮（没有 AI 预估）。 */
function MiniCard({ card, chat }: { card: LobbyCardView; chat: ReturnType<typeof useStartChat> }) {
  return (
    <Card className="cand-card lobby-mini">
      <strong>{card.name}</strong>
      <p className="cand-intro">{card.intro}</p>
      <div className="chips">
        {card.interests.map((i) => (
          <Chip key={i} tone="well">
            {i}
          </Chip>
        ))}
      </div>
      <CardActions userId={card.userId} chat={chat} />
    </Card>
  )
}

function CandidateCard({ card, chat }: { card: LobbyCardView; chat: ReturnType<typeof useStartChat> }) {
  return (
    <Card className="cand-card">
      <div className="cand-head">
        <strong>{card.name}</strong>
        {card.fit && <Chip tone={FIT_TONE[card.fit]}>{FIT_TEXT[card.fit]}</Chip>}
      </div>
      <p className="cand-intro">{card.intro}</p>
      <div className="chips">
        {card.interests.map((i) => (
          <Chip key={i} tone="well">
            {i}
          </Chip>
        ))}
      </div>
      <p className="cand-style">{card.chatStyle}</p>
      <CardActions userId={card.userId} chat={chat} />
    </Card>
  )
}

function AssistantAnswer({ view, chat }: { view: LobbyAssistantView; chat: ReturnType<typeof useStartChat> }) {
  const navigate = useNavigate()
  if (view.kind === 'task') {
    return (
      <div className="lobby-task">
        <p className="helper-ans">{LOBBY_TEXT.taskHint}</p>
        <TaskConfirmCard taskId={view.taskId} onStarted={(task) => navigate(`/tasks/${task.id}`)} />
      </div>
    )
  }
  return (
    <>
      <p className="helper-ans">{view.answer}</p>
      {view.cards.length > 0 ? (
        <div className="lobby-grid">
          {view.cards.map((c) => (
            <MiniCard key={c.userId} card={c} chat={chat} />
          ))}
        </div>
      ) : (
        <p className="lobby-note">{LOBBY_TEXT.noCards}</p>
      )}
    </>
  )
}

function useLobbyCards() {
  const [cards, setCards] = useState<LobbyCardView[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    setError(null)
    setCards(null)
    getLobby()
      .then(setCards)
      .catch((err: unknown) => setError(errorMessage(err, LOBBY_TEXT.loadFailed)))
  }, [])
  useEffect(load, [load])
  return { cards, error, reload: load }
}

export function LiveLobby() {
  const lobby = useLobbyCards()
  const chat = useStartChat()
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState<LobbyAssistantView | null>(null)
  const [askError, setAskError] = useState<string | null>(null)

  const ask = async () => {
    const q = question.trim()
    if (!q || asking) return
    setAsking(true)
    setAnswer(null)
    setAskError(null)
    try {
      setAnswer(await askLobbyAssistant(q))
    } catch (err) {
      setAskError(errorMessage(err, '大厅助手刚才没回上，请再问一次'))
    } finally {
      setAsking(false)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('lobby.title')}</h1>
        <p>{t('lobby.subtitle')}</p>
      </div>

      <Card className="helper-card">
        <div className="helper-head">
          <RiveAvatar name="fish" size={64} />
          <div>
            <strong>{t('lobby.twinHelper')}</strong>
            <p className="helper-intro">{t('lobby.helperIntro')}</p>
          </div>
        </div>
        <div className="chat-input">
          <input
            className="input"
            placeholder={t('lobby.helperPlaceholder')}
            value={question}
            maxLength={200}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && ask()}
          />
          <Button small onClick={ask} disabled={asking || !question.trim()}>
            {t('lobby.helperSend')}
          </Button>
        </div>
        {asking && <p className="helper-ans">{t('lobby.helperTyping')}</p>}
        {askError && (
          <p className="lobby-note" role="alert">
            {askError}
          </p>
        )}
        {answer && <AssistantAnswer view={answer} chat={chat} />}
      </Card>

      <h2 className="section-title">{t('lobby.candidatesTitle')}</h2>
      {lobby.error ? (
        <div className="lobby-actions">
          <p className="lobby-note" role="alert">
            {lobby.error}
          </p>
          <Button small variant="secondary" onClick={lobby.reload}>
            {LOBBY_TEXT.retry}
          </Button>
        </div>
      ) : !lobby.cards ? (
        <p className="empty">{t('common.loading')}</p>
      ) : lobby.cards.length === 0 ? (
        <p className="empty">{LOBBY_TEXT.empty}</p>
      ) : (
        <div className="lobby-grid">
          {lobby.cards.map((c) => (
            <CandidateCard key={c.userId} card={c} chat={chat} />
          ))}
        </div>
      )}
      <p className="mbti-note">{t('lobby.mbtiNote')}</p>
    </div>
  )
}
