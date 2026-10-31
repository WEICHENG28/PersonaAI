import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, Chip } from '@components/ui/Button'
import { Card, CardHead } from '@components/ui/Card'
import { Modal } from '@components/ui/Modal'
import { useDemoStore } from '@store/useDemoStore'
import { t } from '@i18n/t'
import { historyFromApi } from '@lib/api/social'
import { HistoryList } from './components/HistoryList'

/** 没成的次数够多，阿澈才有足够资料总结规律 */
const INSIGHT_MIN_FAILS = 3
/** mock：历史里的不合适案例（陈岭）对应的本人聊天网址 */
const FAILED_CHAT_PATH = '/chat/chen'

/** 画面 9：历史尝试（不合适合例 + 抽象原因 + 重启对话） + 自我观察 */
export function HistoryPage() {
  // http 模式：真的历史资料（B6）；mock 模式：下面的 demo 画面
  if (historyFromApi) {
    return (
      <div className="page">
        <div className="page-head">
          <h1>{t('history.title')}</h1>
          <p>{t('history.subtitle')}</p>
        </div>
        <HistoryList />
      </div>
    )
  }
  return <DemoHistory />
}

function DemoHistory() {
  const s = useDemoStore()
  const navigate = useNavigate()
  const [restartOpen, setRestartOpen] = useState(false)

  const fail = s.failedMatch
  const hasRun = s.task !== null || s.proxyTick > 0
  const linRunning = s.proxyTick > 0 && !s.proxyDone
  const requested = s.humanRequested.includes(fail.withName)
  // 列表里不合适的只有陈岭这一笔（insight 的说法要跟列表一致）
  const failCount = 1

  // UX #14：直接请求真人 → 推通知，按钮变成「已发送请求」
  const requestHuman = () => {
    s.markHumanRequested(fail.withName)
    s.pushNotification({ title: t('history.requestSentTitle'), body: t('history.requestSent'), link: '/history' })
    setRestartOpen(false)
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('history.title')}</h1>
        <p>{t('history.subtitle')}</p>
      </div>

      {!hasRun ? (
        <p className="empty">{t('history.empty')}</p>
      ) : (
        <div className="stack">
          {(s.proxyDone || linRunning) && (
            <Card>
              <CardHead
                title={t('proxyChat.withWho', { name: '林小山' })}
                right={
                  s.proxyDone ? <Chip tone="mint">{t('history.resultMutual')}</Chip> : <Chip tone="well">{t('history.resultRunning')}</Chip>
                }
              />
              <p className="hist-line">
                {t('history.initiatedAuto')} · {linRunning ? t('common.aiChatting') : t('history.ended')}
              </p>
              <div className="hist-actions">
                <Button small variant="secondary" onClick={() => navigate(linRunning ? '/chat/lin' : '/chat/lin/result')}>
                  {linRunning ? t('history.viewLive') : t('history.viewChat')}
                </Button>
              </div>
            </Card>
          )}

          <Card>
            <CardHead title={t('proxyChat.withWho', { name: fail.withName })} right={<Chip tone="coral">{t('history.resultNo')}</Chip>} />
            <p className="hist-line">
              {fail.initiated === 'auto' ? t('history.initiatedAuto') : t('history.initiatedManual')} · {t('history.ended')}
            </p>
            <div className="hist-reason">
              <strong>{t('history.reasonTitle')}</strong>
              <p>
                <Chip tone="well">{t('history.reasonFriction')}</Chip>
                {fail.reasonText}
              </p>
            </div>
            <div className="hist-actions">
              <Button small variant="secondary" onClick={() => setRestartOpen(true)}>
                {t('history.restart')}
              </Button>
              {requested && <Chip tone="pear">{t('history.requestDone')}</Chip>}
              <em className="hint-inline">{t('history.restartHint')}</em>
            </div>
          </Card>

          {/* 帮你了解自己：数字要和列表一致，笔数不够就不硬下结论（UX #25） */}
          <Card>
            <CardHead title={t('history.selfInsight')} />
            <p className="insight-text">
              「{failCount >= INSIGHT_MIN_FAILS ? t('history.selfInsightText') : t('history.selfInsightFew')}」— 阿澈
            </p>
          </Card>
        </div>
      )}

      <Modal open={restartOpen} onClose={() => setRestartOpen(false)} title={t('history.restart')} sub={t('history.restartHint')} demo>
        <div className="restart-opts">
          <Button block variant="secondary" onClick={() => navigate(FAILED_CHAT_PATH)}>
            {t('history.restartSelf')}
          </Button>
          <Button block onClick={requestHuman} disabled={requested}>
            {requested ? t('history.requestDone') : t('history.restartRequestHuman')}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
