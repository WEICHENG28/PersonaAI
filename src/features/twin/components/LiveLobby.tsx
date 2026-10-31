// C9 大厅候选人（http 模式，真资料）。版面沿用 A 做好的大厅卡片（lobby-grid／cand-card），只换资料来源，
// 另外加上找人目的／兴趣关键字筛选，以及「我自己聊」「让分身去聊」两个按钮。拥有者：C。
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, Chip } from '@components/ui/Button'
import { Card } from '@components/ui/Card'
import { t } from '@i18n/t'
import type { LobbyCardView, LobbyPurpose } from '@lib/api/twin'
import { LOBBY_QUERY_MAX, LOBBY_TEXT, PURPOSE_OPTIONS, fitText } from './lobbyView'
import { useLobby, type LobbyAction, type LobbyState } from './useLobby'

export function LiveLobby() {
  const navigate = useNavigate()
  const [purpose, setPurpose] = useState<LobbyPurpose | undefined>(undefined)
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const state = useLobby({ purpose, q })

  const search = () => setQ(draft.trim())
  const clear = () => {
    setDraft('')
    setQ('')
  }
  const start = async (userId: string, action: LobbyAction) => {
    const id = await state.start(userId, action)
    if (!id) return
    navigate(action === 'human' ? `/chat/${encodeURIComponent(id)}` : `/tasks/${encodeURIComponent(id)}`)
  }

  return (
    <>
      <h2 className="section-title">{t('lobby.candidatesTitle')}</h2>
      <Card className="stack">
        <div className="chips" role="group" aria-label={LOBBY_TEXT.filterLabel}>
          <Button small variant={purpose ? 'secondary' : 'primary'} aria-pressed={!purpose} onClick={() => setPurpose(undefined)}>
            {LOBBY_TEXT.allPurposes}
          </Button>
          {PURPOSE_OPTIONS.map((p) => (
            <Button key={p} small variant={purpose === p ? 'primary' : 'secondary'} aria-pressed={purpose === p} onClick={() => setPurpose(p)}>
              {LOBBY_TEXT.purpose[p]}
            </Button>
          ))}
        </div>
        <div className="chat-input">
          <input
            className="input"
            placeholder={LOBBY_TEXT.searchPlaceholder}
            maxLength={LOBBY_QUERY_MAX}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
          />
          <Button small onClick={search}>
            {LOBBY_TEXT.search}
          </Button>
          {q && (
            <Button small variant="secondary" onClick={clear}>
              {LOBBY_TEXT.clear}
            </Button>
          )}
        </div>
      </Card>
      <LobbyCards state={state} onStart={start} />
    </>
  )
}

interface LobbyCardsProps {
  state: LobbyState
  onStart(userId: string, action: LobbyAction): void
}

function LobbyCards({ state, onStart }: LobbyCardsProps) {
  if (state.loadError) {
    return (
      <Card className="stack">
        <strong>{LOBBY_TEXT.loadFailed}</strong>
        <p>{state.loadError}</p>
        <Button small variant="secondary" onClick={state.reload}>
          {LOBBY_TEXT.retry}
        </Button>
      </Card>
    )
  }
  if (!state.cards) return <p className="empty">{LOBBY_TEXT.loading}</p>
  if (state.cards.length === 0) return <p className="empty">{LOBBY_TEXT.empty}</p>
  return (
    <div className="lobby-grid">
      {state.cards.map((c) => (
        <LobbyCard key={c.userId} card={c} state={state} onStart={onStart} />
      ))}
    </div>
  )
}

interface LobbyCardProps {
  card: LobbyCardView
  state: LobbyState
  onStart(userId: string, action: LobbyAction): void
}

function LobbyCard({ card, state, onStart }: LobbyCardProps) {
  const busy = state.pending !== null
  const pendingHere = state.pending?.userId === card.userId ? state.pending.action : null
  const error = state.actionError?.userId === card.userId ? state.actionError.message : null
  return (
    <Card className="cand-card">
      <div className="cand-head">
        <strong>{card.name}</strong>
      </div>
      <p className="cand-intro">{card.headline}</p>
      <div className="chips">
        {card.tags.map((tag) => (
          <Chip key={tag} tone="well">
            {tag}
          </Chip>
        ))}
      </div>
      <p className="cand-style">{card.chatStyle}</p>
      <footer className="cand-foot">
        <span className="cand-fit">
          {t('lobby.fitPredict')} <b>{fitText(card.fit)}</b>
        </span>
        {card.mbti && (
          <Chip tone="paper" className="cand-mbti">
            {card.mbti} · {t('lobby.mbtiBadge')}
          </Chip>
        )}
      </footer>
      <div className="chips">
        <Button small disabled={busy} onClick={() => onStart(card.userId, 'human')}>
          {pendingHere === 'human' ? LOBBY_TEXT.starting : LOBBY_TEXT.chatMyself}
        </Button>
        <Button small variant="secondary" disabled={busy} onClick={() => onStart(card.userId, 'twin')}>
          {pendingHere === 'twin' ? LOBBY_TEXT.starting : LOBBY_TEXT.sendTwin}
        </Button>
      </div>
      {error && (
        <p className="cand-style" role="alert">
          {error}
        </p>
      )}
    </Card>
  )
}
