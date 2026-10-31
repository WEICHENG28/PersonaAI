import { useDemoStore } from '@store/useDemoStore'
import { t } from '@i18n/t'
import { demoReportStats, reportLead } from '@demo/report'
import { formatDuration } from '@features/social/formatDuration'

/** 阿澈的回报卡内容（mock）：数字全部从 store 算（UX #7、#24）。 */
export function TaskReport() {
  const proxyDone = useDemoStore((s) => s.proxyDone)
  const progress = useDemoStore((s) => s.task?.progress ?? 0)
  const avgManualMin = useDemoStore((s) => s.settings.avgManualMin)
  const stats = demoReportStats({ proxyDone, progress, avgManualMin })

  return (
    <div className="report stack">
      <p className="report__lead">「{reportLead(stats)}」</p>
      <div className="stats-row">
        <div className="stat">
          <b>{stats.screened}</b>
          <span>{t('report.statScanned')}</span>
        </div>
        <div className="stat">
          <b>{stats.chats}</b>
          <span>{t('report.statChatted')}</span>
        </div>
        <div className="stat stat--mint">
          <b>{stats.fit}</b>
          <span>{t('report.statFit')}</span>
        </div>
      </div>
      <p className="report__calc">
        {t('report.calcNote', { sessions: stats.chats, avg: avgManualMin, saved: formatDuration(stats.savedMinutes) })}
        <em>{t('report.calcNoteAdjust')}</em>
      </p>
    </div>
  )
}
