import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ChatBubble } from '@components/ui/ChatBubble'
import { Button, Chip } from '@components/ui/Button'
import { Card } from '@components/ui/Card'
import { useDemoStore } from '@store/useDemoStore'
import { useAutoScrollBottom } from '@hooks/useAutoScrollBottom'
import { t } from '@i18n/t'
import { AgentLogPanel } from '@components/AgentLogPanel'
import { isLiveChat } from '@lib/api/twin'
import { LiveChatRoom } from './components/LiveChatRoom'
import { usePrivacyCheck } from '@components/PrivacyWarning'

/** 画面 5：聊天室。http 模式且网址有对话 id（/chat/:id）→ 真资料；其他情况照旧跑 demo。 */
export function ProxyChatPage() {
  const { id } = useParams()
  if (isLiveChat && id) return <LiveChatRoom key={id} conversationId={id} />
  return <DemoProxyChat />
}

/** mock 模式的分身 ↔ 分身代聊（直播面板，demo store 推进）。 */
function DemoProxyChat() {
  const s = useDemoStore()
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')
  const chatRef = useAutoScrollBottom<HTMLDivElement>(s.proxyMessages.length)

  const lastRound = s.proxyMessages.at(-1)?.round ?? 0
  const latestVerdict = [...s.verdicts].reverse().find((v) => v.round <= lastRound)

  // 接手後是本人在和對方聊：送出前檢查隱私
  const privacy = usePrivacyCheck('human')
  const send = () => {
    const text = draft.trim()
    if (!text) return
    privacy.guard(text, () => {
      s.sendProxyMessage(text)
      setDraft('')
    })
  }

  return (
    <div className="page">
      {privacy.dialog}
      <div className="page-head">
        <h1>{t('proxyChat.withWho', { name: '林小山' })}</h1>
        <p>
          <Chip tone="ink">{t('common.aiChatting')}</Chip>{' '}
          {!s.proxyDone && <Chip tone="coral">{t('proxyChat.liveTag')}</Chip>}
        </p>
      </div>

      <div className="friend-layout">
        <Card className="friend-chat">
          <div className="friend-chat__head">
            <span className="twin-tag twin-tag--mine">{t('proxyChat.viaTwin')}</span>
            <span className="twin-tag twin-tag--other">{t('proxyChat.viaOtherTwin')}</span>
          </div>

          <div className="chat" ref={chatRef}>
            {s.proxyMessages.length === 0 && (
              <p className="empty">{t('common.loading')}</p>
            )}
            {s.proxyMessages.map((m) => (
              <ChatBubble
                key={m.id}
                speaker={m.speaker}
                aiChatting={!s.takenOver && (m.speaker === 'twin' || m.speaker === 'other-twin')}
                privacyRewrite={m.privacyRewrite}
                privacyTip={t('proxyChat.privacyRewriteTip')}
                roundTag={t('proxyChat.round', { n: m.round ?? 0 })}
              >
                {m.text}
              </ChatBubble>
            ))}
          </div>

          {/* 即时判定面板（不接手也能看，02 §F7） */}
          <div className="verdict-live">
            <strong>{t('proxyChat.verdictPanel')}</strong>
            {latestVerdict ? (
              <p>
                {t('proxyChat.round', { n: latestVerdict.round })}：我方 {latestVerdict.mine} ·{' '}
                {trendLabel(latestVerdict.trend)} · {latestVerdict.reason}
              </p>
            ) : (
              <p>{t('proxyChat.verdictWatching')}</p>
            )}
          </div>

          <div className="chat-input">
            <input
              className="input"
              placeholder={s.takenOver ? '以本人身份说点什么…' : t('proxyChat.takeOver') + '后可输入'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              disabled={!s.takenOver}
            />
            {s.takenOver ? (
              <Button small onClick={send} disabled={!draft.trim()}>
                {t('friend.send')}
              </Button>
            ) : (
              <Button small variant="secondary" onClick={() => navigate('/chat/lin/handoff')}>
                {t('proxyChat.takeOver')}
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
          {!s.takenOver && (
            <Button block variant="secondary" onClick={() => navigate('/chat/lin/handoff')}>
              {t('proxyChat.takeOver')}
            </Button>
          )}
          {s.settings.devMode && <AgentLogPanel logs={s.taskLogs} />}
        </div>
      </div>
    </div>
  )
}

function trendLabel(trend: 'up' | 'flat' | 'down') {
  if (trend === 'up') return t('proxyChat.trendUp')
  if (trend === 'down') return t('proxyChat.trendDown')
  return t('proxyChat.trendFlat')
}
