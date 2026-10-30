import { useNavigate } from 'react-router'
import { Button, Chip } from '@components/ui/Button'
import { Card, CardHead } from '@components/ui/Card'
import { useDemoStore } from '@store/useDemoStore'
import { t } from '@i18n/t'

/** 画面 8：接手卡片（判定走势、聊过重点、分身说过的话、建议接话） */
export function HandoffPage() {
  const s = useDemoStore()
  const navigate = useNavigate()

  const final = s.verdicts[s.verdicts.length - 1]
  const twinSaid = s.proxyMessages.filter((m) => m.speaker === 'twin').slice(-4)

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('handoff.title')}</h1>
        <p>{t('handoff.subtitle')}</p>
      </div>

      <div className="stack">
        <Card>
          <CardHead
            title={t('handoff.verdictNow')}
            right={<Chip tone="mint">{t('result.myVerdict')}</Chip>}
          />
          <div className="trend-row">
            {s.verdicts.map((v) => (
              <div key={v.round} className={`trend-cell ${v.trend}`} title={v.reason}>
                <i>{v.mine}</i>
                <span>R{v.round}</span>
              </div>
            ))}
          </div>
          <p className="verdict-note">目前 {final?.mine} 分 · {t('proxyChat.trendUp')}</p>
        </Card>

        <Card>
          <CardHead title={t('handoff.keyPoints')} />
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
              <h3>{t('result.outlineHighlight')}</h3>
              <ul>
                {s.outline.highlights.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </section>
          </div>
        </Card>

        <Card>
          <CardHead title={t('handoff.twinSaid')} sub="接手后别说矛盾的话" />
          <div className="chat">
            {twinSaid.map((m) => (
              <ChatBubbleStatic key={m.id} text={m.text} round={m.round ?? 0} />
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title={t('handoff.suggest')} />
          <ul className="suggest-list">
            {s.handoffSuggest.map((x) => (
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

function ChatBubbleStatic({ text, round }: { text: string; round: number }) {
  return (
    <div className="bubble bubble--twin">
      <span className="bubble__round">{t('proxyChat.round', { n: round })}</span>
      <div className="bubble__body">{text}</div>
    </div>
  )
}
