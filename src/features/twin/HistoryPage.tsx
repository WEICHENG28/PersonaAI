import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, Chip } from '@components/ui/Button'
import { Card, CardHead } from '@components/ui/Card'
import { useDemoStore } from '@store/useDemoStore'
import { t } from '@i18n/t'

/** 画面 9：历史尝试（不合适合例 + 抽象原因 + 重启对话） + 自我观察 */
export function HistoryPage() {
  const s = useDemoStore()
  const navigate = useNavigate()
  const [restartOpen, setRestartOpen] = useState(false)

  const fail = s.failedMatch
  const hasRun = s.task !== null || s.proxyDone

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
          {s.proxyDone && (
            <Card>
              <CardHead
                title={t('proxyChat.withWho', { name: '林小山' })}
                right={<Chip tone="mint">{t('history.resultMutual')}</Chip>}
              />
              <p className="hist-line">
                {t('history.initiatedAuto')} · {t('common.aiChatting')}
              </p>
              <Button small variant="secondary" onClick={() => navigate('/chat/lin/result')}>
                {t('history.viewChat')}
              </Button>
            </Card>
          )}

          <Card>
            <CardHead
              title={t('proxyChat.withWho', { name: fail.withName })}
              right={<Chip tone="coral">{t('history.resultNo')}</Chip>}
            />
            <p className="hist-line">
              {fail.initiated === 'auto' ? t('history.initiatedAuto') : t('history.initiatedManual')}
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
              <em className="hint-inline">{t('history.restartHint')}</em>
            </div>
          </Card>

          {/* 帮你了解自己（累积多笔后 AI 朋友的观察） */}
          <Card>
            <CardHead title={t('history.selfInsight')} />
            <p className="insight-text">「{t('history.selfInsightText')}」— 阿澈</p>
          </Card>
        </div>
      )}

      {/* 重启对话 modal */}
      {restartOpen && (
        <div className="modal-scrim" onClick={() => setRestartOpen(false)} role="presentation">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal__head">
              <div>
                <h2 className="modal__title">{t('history.restart')}</h2>
                <p className="modal__sub">{t('history.restartHint')}</p>
              </div>
            </header>
            <div className="modal__body">
              <div className="restart-opts">
                <Button block variant="secondary" onClick={() => setRestartOpen(false)}>
                  {t('history.restartSelf')}
                </Button>
                <Button block onClick={() => setRestartOpen(false)}>
                  {t('history.restartTwin')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
