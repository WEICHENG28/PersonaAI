// C9／C10 大厅（http 模式，真资料）。版面沿用 A 做好的大厅页（helper-card／lobby-grid／cand-card），只换资料来源，
// 另外加上找人目的／兴趣关键字筛选，以及「我自己聊」「让分身去聊」两个按钮（大厅卡片和助手小卡片共用）。拥有者：C。
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@components/ui/Button'
import { Card } from '@components/ui/Card'
import type { LobbyPurpose } from '@lib/api/twin'
import { LobbyAIFloating } from './LobbyAIFloating'
import { LobbyCard } from './LobbyCard'
import { LOBBY_QUERY_MAX, LOBBY_TEXT, PURPOSE_OPTIONS } from './lobbyView'
import { useLobbyCards, useStartChat, type LobbyAction, type LobbyCardsState, type StartChatState } from './useLobby'

export function LiveLobby() {
  const navigate = useNavigate()
  const [purpose, setPurpose] = useState<LobbyPurpose | undefined>(undefined)
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const [nameDraft, setNameDraft] = useState('')
  const [name, setName] = useState('')
  const lobby = useLobbyCards({ purpose, q, name })
  const chat = useStartChat()

  const search = () => {
    setQ(draft.trim())
    setName(nameDraft.trim())
  }
  const clear = () => {
    setDraft('')
    setQ('')
    setNameDraft('')
    setName('')
  }
  const start = async (userId: string, action: LobbyAction) => {
    const id = await chat.start(userId, action)
    if (!id) return
    navigate(action === 'human' ? `/chat/${encodeURIComponent(id)}` : `/tasks/${encodeURIComponent(id)}`)
  }

  return (
    <div className="page">
      {/* 筛选／搜索卡吸附在顶栏下方（.lobby-filter），卷卡片列表时随时能改条件 */}
      <Card className="stack lobby-filter">
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
        <div className="chat-input" style={{ flexWrap: 'wrap' }}>
          {/* 先用名字（ID）找人，再用興趣關鍵字；兩個都填就兩個都要符合 */}
          <input
            className="input"
            style={{ flex: '1 1 160px' }}
            placeholder={LOBBY_TEXT.namePlaceholder}
            aria-label={LOBBY_TEXT.namePlaceholder}
            maxLength={LOBBY_QUERY_MAX}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && search()}
          />
          <input
            className="input"
            style={{ flex: '2 1 220px' }}
            aria-label={LOBBY_TEXT.searchPlaceholder}
            placeholder={LOBBY_TEXT.searchPlaceholder}
            maxLength={LOBBY_QUERY_MAX}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && search()}
          />
          <Button small onClick={search}>
            {LOBBY_TEXT.search}
          </Button>
          {(q || name) && (
            <Button small variant="secondary" onClick={clear}>
              {LOBBY_TEXT.clear}
            </Button>
          )}
        </div>
      </Card>
      <LobbyCards lobby={lobby} chat={chat} onStart={start} />
      <LobbyAIFloating />
    </div>
  )
}

interface LobbyCardsProps {
  lobby: LobbyCardsState
  chat: StartChatState
  onStart(userId: string, action: LobbyAction): void
}

function LobbyCards({ lobby, chat, onStart }: LobbyCardsProps) {
  if (lobby.loadError) {
    return (
      <Card className="stack">
        <strong>{LOBBY_TEXT.loadFailed}</strong>
        <p>{lobby.loadError}</p>
        <Button small variant="secondary" onClick={lobby.reload}>
          {LOBBY_TEXT.retry}
        </Button>
      </Card>
    )
  }
  if (!lobby.cards) return <p className="empty">{LOBBY_TEXT.loading}</p>
  if (lobby.cards.length === 0) return <p className="empty">{LOBBY_TEXT.empty}</p>
  return (
    <div className="lobby-grid">
      {lobby.cards.map((c) => (
        <LobbyCard key={c.userId} card={c} chat={chat} onStart={onStart} />
      ))}
    </div>
  )
}
