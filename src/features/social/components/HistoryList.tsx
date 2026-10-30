import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, Chip } from '@components/ui/Button'
import { Card, CardHead } from '@components/ui/Card'
import { t } from '@i18n/t'
import { ApiError, getHistory, reopenHistory, type HistoryEntry } from '@lib/api/social'

const RESULT: Record<HistoryEntry['result'], { key: string; tone: 'mint' | 'pear' | 'coral' | 'well' }> = {
  mutual: { key: 'history.resultMutual', tone: 'mint' },
  one_way: { key: 'history.resultOneWay', tone: 'pear' },
  unsuitable: { key: 'history.resultNo', tone: 'coral' },
  ongoing: { key: 'history.resultRunning', tone: 'well' },
}

const REASON: Record<NonNullable<HistoryEntry['reason_type']>, string> = {
  not_mutual: 'history.reasonMatch',
  condition_mismatch: 'history.reasonCondition',
  friction: 'history.reasonFriction',
}

/** 歷史嘗試（http 模式，真資料）：結果、抽象原因、對話大綱、重啟對話；不顯示任何分數。 */
export function HistoryList() {
  const navigate = useNavigate()
  const [data, setData] = useState<{ items: HistoryEntry[]; insight: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [restartId, setRestartId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getHistory()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : t('login.errorGeneric')))
  }, [])

  async function restart(mode: 'twin' | 'human') {
    if (!restartId) return
    setBusy(true)
    try {
      const r = await reopenHistory(restartId, mode)
      setRestartId(null)
      if (r.conversationId) navigate(`/chat/${r.conversationId}`)
      else navigate('/friend')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('login.errorGeneric'))
      setRestartId(null)
    } finally {
      setBusy(false)
    }
  }

  if (error) return <p className="chip chip--coral" role="alert">{error}</p>
  if (!data) return <p className="empty">…</p>
  if (data.items.length === 0) return <p className="empty">{t('history.empty')}</p>

  return (
    <div className="stack">
      {data.insight && (
        <Card>
          <CardHead title={t('history.selfInsight')} />
          <p className="insight-text">「{data.insight}」— 阿澈</p>
        </Card>
      )}

      {data.items.map((item) => (
        <Card key={item.id}>
          <CardHead
            title={t('proxyChat.withWho', { name: item.target_name })}
            right={<Chip tone={RESULT[item.result].tone}>{t(RESULT[item.result].key)}</Chip>}
          />
          <p className="hist-line">
            {item.origin === 'auto' ? t('history.initiatedAuto') : t('history.initiatedManual')} · {new Date(item.created_at).toLocaleString()}
          </p>
          {item.outline && item.outline.topics.length > 0 && <p className="hist-line">聊了：{item.outline.topics.join('、')}</p>}
          {item.result === 'unsuitable' && (
            <div className="hist-reason">
              <strong>{t('history.reasonTitle')}</strong>
              <p>
                {item.reason_type && <Chip tone="well">{t(REASON[item.reason_type])}</Chip>}
                {item.reason_text}
              </p>
            </div>
          )}
          <div className="hist-actions">
            <Button small variant="secondary" onClick={() => navigate(`/chat/${item.conversation_id}/result`)}>
              {t('history.viewChat')}
            </Button>
            {item.result === 'unsuitable' && (
              <>
                <Button small variant="secondary" onClick={() => setRestartId(item.id)}>
                  {t('history.restart')}
                </Button>
                <em className="hint-inline">{t('history.restartHint')}</em>
              </>
            )}
          </div>
        </Card>
      ))}

      {restartId && (
        <div className="modal-scrim" onClick={() => setRestartId(null)} role="presentation">
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <header className="modal__head">
              <div>
                <h2 className="modal__title">{t('history.restart')}</h2>
                <p className="modal__sub">{t('history.restartHint')}</p>
              </div>
            </header>
            <div className="modal__body">
              <div className="restart-opts">
                <Button block variant="secondary" disabled={busy} onClick={() => restart('human')}>
                  {t('history.restartSelf')}
                </Button>
                <Button block disabled={busy} onClick={() => restart('twin')}>
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
