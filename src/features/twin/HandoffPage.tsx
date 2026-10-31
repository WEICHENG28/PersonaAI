import { useNavigate } from 'react-router'
import { Button, Chip } from '@components/ui/Button'
import { Card, CardHead } from '@components/ui/Card'
import { useDemoStore } from '@store/useDemoStore'
import { t } from '@i18n/t'
import { completedRound, handoffSuggestUpTo, outlineUpTo, trendOf } from '@demo/proxyTimeline'
import { trendLabel } from './DemoProxyChat'
import { OutlineSections } from './OutlineSections'

/** 画面 8：接手卡片（判定走势、聊过重点、分身说过的话、建议接话）。全部用「当下进度」算（UX #1、#24）。 */
export function HandoffPage() {
  const s = useDemoStore()
  const navigate = useNavigate()

  const round = completedRound(s.proxyStep)
  const final = s.verdicts.at(-1)
  const twinSaid = s.proxyMessages.filter((m) => m.speaker === 'twin').slice(-4)
  const outline = outlineUpTo(round)

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('handoff.title')}</h1>
        <p>{t('handoff.subtitle')}</p>
      </div>

      <div className="stack">
        <Card>
          <CardHead title={t('handoff.verdictNow')} right={final && <Chip tone="mint">{t('result.myVerdict')}</Chip>} />
          {final ? (
            <>
              <div className="trend-row">
                {s.verdicts.map((v) => (
                  <div key={v.round} className={`trend-cell ${v.trend}`} title={v.reason}>
                    <i>{v.mine}</i>
                    <span>R{v.round}</span>
                  </div>
                ))}
              </div>
              <p className="verdict-note">
                目前 {final.mine} 分 · {trendLabel(trendOf(s.verdicts))}
              </p>
            </>
          ) : (
            <p className="hint-inline">{t('proxyChat.verdictWatching')}，还没有判定。</p>
          )}
        </Card>

        {outline.topics.length > 0 && (
          <Card>
            <CardHead title={t('handoff.keyPoints')} />
            <OutlineSections outline={outline} only={['topics', 'highlights']} />
          </Card>
        )}

        <Card>
          <CardHead title={t('handoff.twinSaid')} sub="接手后别说矛盾的话" />
          {twinSaid.length === 0 ? (
            <p className="hint-inline">分身还没替你说话。</p>
          ) : (
            <div className="chat">
              {twinSaid.map((m) => (
                <div key={m.id} className="bubble bubble--twin">
                  {m.round && <span className="bubble__round">{t('proxyChat.round', { n: m.round })}</span>}
                  <div className="bubble__body">{m.text}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHead title={t('handoff.suggest')} />
          <ul className="suggest-list">
            {handoffSuggestUpTo(round).map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="next-actions">
        <Button
          block
          onClick={() => {
            s.takeOver()
            navigate('/chat/lin')
          }}
        >
          {t('handoff.startChat')}
        </Button>
        <Button block variant="secondary" onClick={() => navigate(-1)}>
          {t('handoff.back')}
        </Button>
      </div>
    </div>
  )
}
