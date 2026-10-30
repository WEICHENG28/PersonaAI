import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ChatBubble } from '@components/ui/ChatBubble'
import { Button, Chip } from '@components/ui/Button'
import { Card, CardHead } from '@components/ui/Card'
import { useDemoStore } from '@store/useDemoStore'
import { t } from '@i18n/t'

/** 画面 7：结果页（双向合适徽章、我方视角大纲、为什么你们合、完整纪录） */
export function ResultPage() {
  const s = useDemoStore()
  const navigate = useNavigate()
  const [showFull, setShowFull] = useState(false)
  const [focusRound, setFocusRound] = useState<number | null>(null)

  const final = s.verdicts[s.verdicts.length - 1]

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('proxyChat.withWho', { name: '林小山' })}</h1>
        <p>{t('result.mutualBadgeSub')}</p>
      </div>

      {/* 双向合适 sticker 徽章（无 emoji） */}
      <div className="mutual-badge">
        <span className="mutual-badge__in">{t('result.mutualBadge')}</span>
      </div>

      <div className="stack">
        {/* 判定 */}
        <Card>
          <CardHead
            title={t('result.verdictTitle')}
            right={<Chip tone="well">{t('result.scoreNote')}</Chip>}
          />
          <div className="verdict-final">
            <div className="score">
              <b>{final?.mine}</b>
              <span>{t('result.score')}</span>
            </div>
            <div className="trend-row">
              {s.verdicts.map((v) => (
                <div
                  key={v.round}
                  className={`trend-cell ${v.trend}`}
                  title={v.reason}
                >
                  <i>{v.mine}</i>
                  <span>R{v.round}</span>
                </div>
              ))}
            </div>
            <p className="verdict-note">{t('result.myVerdict')}</p>
            <p className="verdict-hidden">{t('result.oppVerdictHidden')}</p>
          </div>
        </Card>

        {/* 为什么你们合 */}
        <Card>
          <CardHead title={t('result.whyFit')} sub={t('result.whyFitHint')} />
          <ul className="fit-list">
            {s.fitPoints.map((f) => (
              <li key={f.id}>
                <p>{f.text}</p>
                <button className="fit-jump" onClick={() => setFocusRound(f.round)}>
                  {t('result.jumpToRound')} · {t('result.roundTag', { n: f.round })}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {/* 大纲 */}
        <Card>
          <CardHead title={t('result.outline')} />
          <div className="outline">
            <section>
              <h3>{t('result.outlineTopics')}</h3>
              <div className="chips">
                {s.outline.topics.map((x) => (
                  <Chip key={x} tone="well">
                    {x}
                  </Chip>
                ))}
              </div>
            </section>
            <section>
              <h3>{t('result.outlineFit')}</h3>
              <ul>
                {s.outline.fitPoints.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </section>
            <section>
              <h3>{t('result.outlineFriction')}</h3>
              <ul>
                {s.outline.frictionPoints.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </section>
            <section>
              <h3>{t('result.outlineHighlight')}</h3>
              <ul>
                {s.outline.highlights.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </section>
          </div>
        </Card>

        {/* 完整纪录 */}
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
                  className={focusRound === m.round ? 'log-focus' : undefined}
                >
                  <ChatBubble
                    speaker={m.speaker}
                    privacyRewrite={m.privacyRewrite}
                    privacyTip={t('proxyChat.privacyRewriteTip')}
                    roundTag={t('proxyChat.round', { n: m.round ?? 0 })}
                  >
                    {m.text}
                  </ChatBubble>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 下一步 */}
        <Card>
          <CardHead title={t('result.nextTitle')} />
          <div className="next-actions">
            <Button onClick={() => navigate('/chat/lin/handoff')}>{t('result.takeOver')}</Button>
            <Button variant="secondary" onClick={() => navigate('/chat/lin')}>
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
