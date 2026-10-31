import { Chip } from '@components/ui/Button'
import { t } from '@i18n/t'

export interface DemoOutline {
  topics: string[]
  fitPoints: string[]
  frictionPoints: string[]
  highlights: string[]
}

/** mock 结果页／接手卡共用的对话大纲（空的区块不显示） */
export function OutlineSections({ outline, only }: { outline: DemoOutline; only?: (keyof DemoOutline)[] }) {
  const show = (k: keyof DemoOutline) => (!only || only.includes(k)) && outline[k].length > 0
  return (
    <div className="outline">
      {show('topics') && (
        <section>
          <h3>{t('result.outlineTopics')}</h3>
          <div className="chips">
            {outline.topics.map((x) => (
              <Chip key={x} tone="well">
                {x}
              </Chip>
            ))}
          </div>
        </section>
      )}
      {show('fitPoints') && <ListSection title={t('result.outlineFit')} items={outline.fitPoints} />}
      {show('frictionPoints') && <ListSection title={t('result.outlineFriction')} items={outline.frictionPoints} />}
      {show('highlights') && <ListSection title={t('result.outlineHighlight')} items={outline.highlights} />}
    </div>
  )
}

function ListSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h3>{title}</h3>
      <ul>
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </section>
  )
}
