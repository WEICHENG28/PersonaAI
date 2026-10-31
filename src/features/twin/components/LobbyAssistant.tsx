// C10 大厅 AI 助手（http 模式，真资料）。版面沿用 A 做好的 helper-card；回答下方附候选人小卡片（两个按钮），
// 像交办任务时显示 B 的任务确认卡。回答与卡片都没有分数数字（后端已挡）。拥有者：C。
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@components/ui/Button'
import { Card } from '@components/ui/Card'
import { RiveAvatar } from '@components/ui/RiveAvatar'
import { TaskConfirmCard } from '@features/social/components/TaskConfirmCard'
import { t } from '@i18n/t'
import { askLobbyAssistant, type LobbyAssistantView } from '@lib/api/twin'
import { LobbyCard } from './LobbyCard'
import { LOBBY_TEXT, QUESTION_MAX } from './lobbyView'
import { messageOf, type LobbyAction, type StartChatState } from './useLobby'

interface LobbyAssistantProps {
  chat: StartChatState
  onStart(userId: string, action: LobbyAction): void
}

export function LobbyAssistant({ chat, onStart }: LobbyAssistantProps) {
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
      setAskError(messageOf(err))
    } finally {
      setAsking(false)
    }
  }

  return (
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
          maxLength={QUESTION_MAX}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && ask()}
        />
        <Button small onClick={ask} disabled={asking || !question.trim()}>
          {t('lobby.helperSend')}
        </Button>
      </div>
      {asking && <p className="helper-ans">{t('lobby.helperTyping')}</p>}
      {askError && (
        <p className="helper-ans" role="alert">
          {askError}
        </p>
      )}
      {answer && <AssistantAnswer view={answer} chat={chat} onStart={onStart} />}
    </Card>
  )
}

interface AssistantAnswerProps extends LobbyAssistantProps {
  view: LobbyAssistantView
}

function AssistantAnswer({ view, chat, onStart }: AssistantAnswerProps) {
  const navigate = useNavigate()
  if (view.kind === 'task') {
    return (
      <div className="stack">
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
            <LobbyCard key={c.userId} card={c} chat={chat} onStart={onStart} showFit={false} />
          ))}
        </div>
      ) : (
        <p className="helper-intro">{LOBBY_TEXT.noCards}</p>
      )}
    </>
  )
}
