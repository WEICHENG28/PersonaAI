// C9 大厅卡片（大厅列表与 C10 助手小卡片共用）。版面沿用 A 做好的 cand-card。拥有者：C。
import { Button, Chip } from '@components/ui/Button'
import { Card } from '@components/ui/Card'
import { t } from '@i18n/t'
import type { LobbyCardView } from '@lib/api/twin'
import { LOBBY_TEXT, fitText } from './lobbyView'
import type { LobbyAction, StartChatState } from './useLobby'
import { PersonKindChip } from '@components/PersonKindChip'

interface LobbyCardProps {
  card: LobbyCardView
  chat: StartChatState
  onStart(userId: string, action: LobbyAction): void
  /** 助手的小卡片不显示 AI 预估（是依问题搜的，不是跟我合不合）。 */
  showFit?: boolean
}

export function LobbyCard({ card, chat, onStart, showFit = true }: LobbyCardProps) {
  const busy = chat.pending !== null
  const pendingHere = chat.pending?.userId === card.userId ? chat.pending.action : null
  const error = chat.actionError?.userId === card.userId ? chat.actionError.message : null
  return (
    <Card className="cand-card">
      <div className="cand-head">
        <strong>{card.name}</strong> <PersonKindChip isSeed={card.isSeed} />
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
      {/* 文字预估比原本的数字长，和 MBTI 放同一行在手机上会挤成两行，所以各占一行 */}
      {showFit && (
        <p className="cand-fit">
          {t('lobby.fitPredict')} <b>{fitText(card.fit)}</b>
        </p>
      )}
      {card.mbti && (
        <footer className="cand-foot">
          <Chip tone="paper" className="cand-mbti">
            {card.mbti} · {t('lobby.mbtiBadge')}
          </Chip>
        </footer>
      )}
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
