import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Button } from '@components/ui/Button'
import { Card, CardHead } from '@components/ui/Card'
import { useDemoStore } from '@store/useDemoStore'
import { t } from '@i18n/t'
import { isLiveChat } from '@lib/api/twin'
import { completedRound, fitPointsUpTo, outlineUpTo } from '@demo/proxyTimeline'
import { LiveResult } from './components/LiveResult'
import { ProxyBubble } from './DemoProxyChat'
import { OutlineSections } from './OutlineSections'

/** 跳到某轮后高亮多久 */
const FOCUS_MS = 2000

/** 画面 7：结果页。http 模式且网址有对话 id（/chat/:id/result）→ 真资料；其他情况照旧跑 demo。 */
export function ResultPage() {
  const { id } = useParams()
  if (isLiveChat && id) return <LiveResult key={id} conversationId={id} />
  return <DemoResult />
}

/** mock 模式的结果页：只引用已经出现过的轮次（UX #1），跳到某轮会展开并捲过去（UX #19）。 */
function DemoResult() {
  const s = useDemoStore()
  const navigate = useNavigate()
  const [showFull, setShowFull] = useState(false)
  const [focusRound, setFocusRound] = useState<number | null>(null)

  const round = completedRound(s.proxyStep)
  const final = s.verdicts.at(-1)
  const fits = fitPointsUpTo(round)

  // 展开后再捲到该轮第一则讯息，2 秒后取消高亮
  useEffect(() => {
    if (focusRound === null) return
    document.getElementById(`log-round-${focusRound}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const timer = setTimeout(() => setFocusRound(null), FOCUS_MS)
    return () => clearTimeout(timer)
  }, [focusRound])

  const jumpTo = (r: number) => {
    setShowFull(true)
    setFocusRound(r)
  }

  const firstOfRound = new Set<string>()
  const seen = new Set<number>()
  for (const m of s.proxyMessages) {
    if (m.round && !seen.has(m.round)) {
      seen.add(m.round)
      firstOfRound.add(m.id)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('proxyChat.withWho', { name: '林小山' })}</h1>
        <p>{s.proxyDone ? t('result.mutualBadgeSub') : t('result.stillRunning')}</p>
      </div>

      {/* 双向合适 sticker 徽章：代聊结束才出现 */}
      {s.proxyDone && (
        <div className="mutual-badge">
          <span className="mutual-badge__in">{t('result.mutualBadge')}</span>
        </div>
      )}

      <div className="stack">
        <Card>
          <CardHead title={t('result.verdictTitle')} />
          {final ? (
            <div className="verdict-final">
              <div className="score" title={t('result.scoreNote')}>
                <b>{final.mine}</b>
                <span>
                  {t('result.score')} <abbr className="score-help" aria-label={t('result.scoreNote')}>?</abbr>
                </span>
              </div>
              <div className="trend-row">
                {s.verdicts.map((v) => (
                  <div key={v.round} className={`trend-cell ${v.trend}`} title={v.reason}>
                    <i>{v.mine}</i>
                    <span>R{v.round}</span>
                  </div>
                ))}
              </div>
              {s.proxyDone && <p className="verdict-note">{t('result.myVerdict')}</p>}
              <p className="verdict-hidden">{t('result.oppVerdictHidden')}</p>
            </div>
          ) : (
            <p className="empty">{t('proxyChat.verdictWatching')}</p>
          )}
        </Card>

        {fits.length > 0 && (
          <Card>
            <CardHead title={t('result.whyFit')} sub={t('result.whyFitHint')} />
            <ul className="fit-list">
              {fits.map((f) => (
                <li key={f.id}>
                  <p>{f.text}</p>
                  <button className="fit-jump" onClick={() => jumpTo(f.round)}>
                    {t('result.jumpToRound')} · {t('result.roundTag', { n: f.round })}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {round > 0 && (
          <Card>
            <CardHead title={t('result.outline')} />
            <OutlineSections outline={outlineUpTo(round)} />
          </Card>
        )}

        <Card>
          <CardHead
            title={t('result.fullLog')}
            right={
              <Button small variant="secondary" onClick={() => setShowFull((v) => !v)}>
                {showFull ? t('result.fullLogHide') : t('result.fullLogShow')}
              </Button>
            }
          />
          {showFull && (
            <div className="chat">
              {s.proxyMessages.map((m) => (
                <div
                  key={m.id}
                  id={firstOfRound.has(m.id) ? `log-round-${m.round}` : undefined}
                  className={focusRound !== null && focusRound === m.round ? 'log-focus' : undefined}
                >
                  <ProxyBubble message={m} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHead title={t('result.nextTitle')} />
          <div className="next-actions">
            <Button onClick={() => navigate('/chat/lin/handoff')}>{t('result.takeOver')}</Button>
            <Button
              variant="secondary"
              onClick={() => {
                s.handBack()
                navigate('/chat/lin')
              }}
            >
              {t('result.continueTwin')}
            </Button>
            <Button variant="secondary" onClick={() => navigate('/history')}>
              {t('result.skip')}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
