import type { AgentLog } from '@lib/api/types'
import { Card, CardHead } from '@components/ui/Card'
import { t } from '@i18n/t'

const ROLE_LABEL: Record<AgentLog['role'], string> = {
  social: '社交 Agent',
  twin: '分身 Agent',
  judge: '评审 Agent',
  privacy: '隐私守门',
  friend: 'AI 朋友',
}

/** Agent 工作日志面板（settings.dev_mode 开启时显示，02 §4） */
export function AgentLogPanel({ logs }: { logs: AgentLog[] }) {
  return (
    <Card className="log-panel">
      <CardHead title={t('logs.title')} sub={t('logs.hint')} />
      {logs.length === 0 ? (
        <p className="empty">{t('logs.empty')}</p>
      ) : (
        <ol className="log-list">
          {logs.map((log) => (
            <li key={log.id} className="log">
              <div className="log__head">
                <span className="log__role">{ROLE_LABEL[log.role]}</span>
                <time>{fmtTime(log.at)}</time>
              </div>
              <p className="log__text">{log.text}</p>
              <p className="log__reason">
                {t('logs.reason')}：{log.reason}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

function fmtTime(at: number) {
  const d = new Date(at)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}
