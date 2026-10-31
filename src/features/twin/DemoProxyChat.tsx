import { Fragment, useState } from 'react'
import { useNavigate } from 'react-router'
import { ChatBubble } from '@components/ui/ChatBubble'
import { Button, Chip } from '@components/ui/Button'
import { Card } from '@components/ui/Card'
import { useDemoStore } from '@store/useDemoStore'
import { useAutoScrollBottom } from '@hooks/useAutoScrollBottom'
import { t } from '@i18n/t'
import { AgentLogPanel } from '@components/AgentLogPanel'
import { trendOf } from '@demo/proxyTimeline'
import type { ChatMessage } from '@lib/api/types'

/** mock 模式的分身 ↔ 分身代聊（直播面板，demo store 推进）。 */
export function DemoProxyChat() {
  const s = useDemoStore()
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')
  const chatRef = useAutoScrollBottom<HTMLDivElement>(s.proxyMessages.length + s.controlNotes.length)

  const latestVerdict = s.verdicts.at(-1)
  const goHandoff = () => navigate('/chat/lin/handoff')

  const send = () => {
    if (!draft.trim()) return
    s.sendProxyMessage(draft.trim())
    setDraft('')
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('proxyChat.withWho', { name: '林小山' })}</h1>
        <p>
          {s.takenOver ? (
            <Chip tone="mint">{t('proxyChat.selfInControl')}</Chip>
          ) : (
            <>
              <Chip tone="ink">{t('common.aiChatting')}</Chip>{' '}
              {!s.proxyDone && s.proxyTick > 0 && <Chip tone="coral">{t('proxyChat.liveTag')}</Chip>}
            </>
          )}
        </p>
      </div>

      <div className="friend-layout">
        <Card className="friend-chat friend-chat--proxy">
          <div className="friend-chat__head">
            <span className="twin-tag twin-tag--mine">{s.takenOver ? t('proxyChat.viaSelf') : t('proxyChat.viaTwin')}</span>
            <span className="twin-tag twin-tag--other">{t('proxyChat.viaOtherTwin')}</span>
          </div>

          <div className="chat" ref={chatRef}>
            {s.proxyMessages.length === 0 ? (
              !s.takenOver && <p className="empty">{s.proxyTick > 0 ? t('common.loading') : t('proxyChat.notStarted')}</p>
            ) : (
              <p className="chat-note">{t('proxyChat.twinsBelow')}</p>
            )}
            {s.controlNotes
              .filter((n) => n.afterCount === 0)
              .map((n) => (
                <p key={n.id} className="chat-note">{n.text}</p>
              ))}
            {s.proxyMessages.map((m, i) => (
              <Fragment key={m.id}>
                <ProxyBubble message={m} />
                {s.controlNotes
                  .filter((n) => n.afterCount === i + 1)
                  .map((n) => (
                    <p key={n.id} className="chat-note">{n.text}</p>
                  ))}
              </Fragment>
            ))}
          </div>

          {/* 即时判定面板（不接手也能看，02 §F7）：只显示已经公布的判定 */}
          <div className="verdict-live">
            <strong>{t('proxyChat.verdictPanel')}</strong>
            {latestVerdict ? (
              <p>
                {t('proxyChat.round', { n: latestVerdict.round })}：我方 {latestVerdict.mine} · {trendLabel(trendOf(s.verdicts))} ·{' '}
                {latestVerdict.reason}
              </p>
            ) : (
              <p>{t('proxyChat.verdictWatching')}</p>
            )}
          </div>

          <div className="chat-input">
            <input
              className="input"
              placeholder={s.takenOver ? '以本人身份说点什么…' : `${t('proxyChat.takeOver')}后可输入`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && send()}
              disabled={!s.takenOver}
            />
            {s.takenOver ? (
              <Button small onClick={send} disabled={!draft.trim()}>
                {t('friend.send')}
              </Button>
            ) : (
              // 手机：「本人接手」放在输入列；桌机放侧栏（同页只出现一个，UX #31）
              <Button small variant="secondary" className="only-mobile" onClick={goHandoff}>
                {t('proxyChat.takeOverShort')}
              </Button>
            )}
          </div>
        </Card>

        <div className="friend-side stack">
          {s.proxyDone && (
            <Button block onClick={() => navigate('/chat/lin/result')}>
              {t('proxyChat.resultLink')}
            </Button>
          )}
          {s.takenOver ? (
            <Button block variant="secondary" onClick={s.handBack}>
              {t('result.continueTwin')}
            </Button>
          ) : (
            <Button block variant="secondary" className="only-desktop" onClick={goHandoff}>
              {t('proxyChat.takeOver')}
            </Button>
          )}
          {s.settings.devMode && <AgentLogPanel logs={s.taskLogs} />}
        </div>
      </div>
    </div>
  )
}

/** 代聊泡泡：AI 讯息只挂一个小「AI」；本人讯息不显示轮次（UX #8、#31） */
export function ProxyBubble({ message: m }: { message: ChatMessage }) {
  const isAi = m.speaker === 'twin' || m.speaker === 'other-twin'
  const tag = m.round ? t('proxyChat.round', { n: m.round }) : m.speaker === 'other-twin' ? t('proxyChat.viaOtherTwin') : undefined
  return (
    <ChatBubble
      speaker={m.speaker}
      aiChatting={isAi}
      privacyRewrite={m.privacyRewrite}
      privacyTip={t('proxyChat.privacyRewriteTip')}
      roundTag={tag}
    >
      {m.text}
    </ChatBubble>
  )
}

export function trendLabel(trend: 'up' | 'flat' | 'down'): string {
  if (trend === 'up') return t('proxyChat.trendUp')
  if (trend === 'down') return t('proxyChat.trendDown')
  return t('proxyChat.trendFlat')
}
