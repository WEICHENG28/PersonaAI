// C6 接手卡片（http 模式，真资料）。版面沿用 A 做好的接手页（画面 8：page-head／outline／suggest-list／next-actions），只换资料来源。拥有者：C。
// 只显示我方视角：判定是文字＋走势，没有分数。已经接手了，所以没有「先不接手」，也没有交回分身。
import { useEffect } from 'react'
import { Button, Chip } from '@components/ui/Button'
import { Card, CardHead } from '@components/ui/Card'
import { t } from '@i18n/t'
import type { TakeoverView } from '@lib/api/twin'
import { CHAT_TEXT, verdictText } from './chatRoomView'
import { HANDOFF_TEXT } from './handoffView'

interface HandoffCardProps {
  view: TakeoverView
  /** 按「开始由本人聊」：关闭卡片，回到聊天室。 */
  onStart(): void
}

export function HandoffCard({ view, onStart }: HandoffCardProps) {
  const { summary } = view
  // 从聊天室切过来时可能停在页面下方
  useEffect(() => window.scrollTo({ top: 0 }), [])
  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('handoff.title')}</h1>
        <p>{t('handoff.subtitle')}</p>
      </div>

      <div className="stack">
        {view.summaryFailed && <p role="status">{HANDOFF_TEXT.summaryFailed}</p>}

        <Card>
          <CardHead title={t('handoff.verdictNow')} />
          <p className="verdict-note">{verdictText(view.verdict) ?? CHAT_TEXT.verdictWatching}</p>
          <p className="verdict-hidden">{t('result.oppVerdictHidden')}</p>
        </Card>

        <Card>
          <CardHead title={t('handoff.keyPoints')} />
          <div className="outline">
            <ItemList items={summary.key_points} />
            <section>
              <h3>{HANDOFF_TEXT.otherHighlights}</h3>
              <ItemList items={summary.other_highlights} />
            </section>
            <section>
              <h3>{HANDOFF_TEXT.openTopics}</h3>
              <div className="chips">
                {summary.open_topics.length === 0 && <span>{HANDOFF_TEXT.empty}</span>}
                {summary.open_topics.map((x, i) => (
                  <Chip key={`${i}-${x}`} tone="well">
                    {x}
                  </Chip>
                ))}
              </div>
            </section>
          </div>
        </Card>

        <Card>
          <CardHead title={t('handoff.twinSaid')} sub={HANDOFF_TEXT.twinSaidSub} />
          <div className="outline">
            <ItemList items={summary.twin_said} />
          </div>
        </Card>

        <Card>
          <CardHead title={t('handoff.suggest')} />
          {summary.suggested_replies.length === 0 ? (
            <p>{HANDOFF_TEXT.empty}</p>
          ) : (
            <ul className="suggest-list">
              {summary.suggested_replies.map((x, i) => (
                <li key={`${i}-${x}`}>{x}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="next-actions">
        <Button block onClick={onStart}>
          {t('handoff.startChat')}
        </Button>
      </div>
    </div>
  )
}

function ItemList({ items }: { items: string[] }) {
  if (items.length === 0) return <p>{HANDOFF_TEXT.empty}</p>
  return (
    <ul>
      {items.map((x, i) => (
        <li key={`${i}-${x}`}>{x}</li>
      ))}
    </ul>
  )
}
