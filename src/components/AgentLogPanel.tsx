import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import type { AgentLog } from '@lib/api/types'
import { Button, Chip } from '@components/ui/Button'
import { Card, CardHead } from '@components/ui/Card'
import { t } from '@i18n/t'
import { ApiError, getLogs, historyFromApi, subscribeLogs, type LogEntry } from '@lib/api/social'

type Role = 'friend' | 'social' | 'twin' | 'judge' | 'guard'

/** 不同 Agent 用不同顏色的標籤（07B 的 B7）。 */
const ROLE: Record<Role, { label: string; tone: 'pear' | 'ink' | 'well' | 'mint' | 'coral' }> = {
  friend: { label: 'AI 朋友', tone: 'pear' },
  social: { label: '社交 Agent', tone: 'ink' },
  twin: { label: '分身 Agent', tone: 'well' },
  judge: { label: '评审 Agent', tone: 'mint' },
  guard: { label: '隐私守门', tone: 'coral' },
}

interface Row {
  id: string
  role: Role
  at: number
  text: string
  reason: string | null
  taskId?: string | null
  conversationId?: string | null
}

/**
 * Agent 工作日志面板（settings.dev_mode 开启时显示，02 §4）。
 * http 模式：自己载入最新 50 笔，再用 Realtime 即时加入新的；mock 模式：显示传进来的 demo 日志。
 */
export function AgentLogPanel({ logs = [] }: { logs?: AgentLog[] }) {
  if (historyFromApi) return <LiveLogPanel />
  const rows = logs.map((l): Row => ({ id: l.id, role: l.role === 'privacy' ? 'guard' : l.role, at: l.at, text: l.text, reason: l.reason }))
  return <LogCard rows={rows} />
}

function LiveLogPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [taskId, setTaskId] = useState('')

  useEffect(() => {
    getLogs()
      .then((rows) => setLogs((live) => mergeLogs(live, rows)))
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : t('login.errorGeneric')))
    return subscribeLogs((log) => setLogs((prev) => mergeLogs(prev, [log])))
  }, [])

  const taskIds = useMemo(() => [...new Set(logs.map((l) => l.task_id).filter((id): id is string => Boolean(id)))], [logs])
  const rows = logs
    .filter((l) => !taskId || l.task_id === taskId)
    .map((l): Row => ({
      id: l.id,
      role: l.agent,
      at: new Date(l.created_at).getTime(),
      text: l.action,
      reason: l.reason,
      taskId: l.task_id,
      conversationId: l.conversation_id,
    }))

  return (
    <LogCard rows={rows} error={error}>
      {taskIds.length > 1 && (
        <label className="field">
          <span>依任务筛选</span>
          <select className="input" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            <option value="">全部任务</option>
            {taskIds.map((id, i) => (
              <option key={id} value={id}>
                任务 {taskIds.length - i}
              </option>
            ))}
          </select>
        </label>
      )}
    </LogCard>
  )
}

/** 新的在前、依 id 去重（初始載入和 Realtime 可能同時收到同一筆）。 */
function mergeLogs(current: LogEntry[], incoming: LogEntry[]): LogEntry[] {
  const byId = new Map([...current, ...incoming].map((l) => [l.id, l]))
  return [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 200)
}

function LogCard({ rows, error, children }: { rows: Row[]; error?: string | null; children?: ReactNode }) {
  const navigate = useNavigate()
  return (
    <Card className="log-panel">
      <CardHead title={t('logs.title')} sub={t('logs.hint')} />
      {children}
      {error && (
        <p className="chip chip--coral" role="alert">
          {error}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="empty">{t('logs.empty')}</p>
      ) : (
        <ol className="log-list">
          {rows.map((log) => (
            <li key={log.id} className="log">
              <div className="log__head">
                <Chip tone={ROLE[log.role].tone}>{ROLE[log.role].label}</Chip>
                <time>{fmtTime(log.at)}</time>
              </div>
              <p className="log__text">{log.text}</p>
              {log.reason && (
                <p className="log__reason">
                  {t('logs.reason')}：{log.reason}
                </p>
              )}
              {log.conversationId && (
                <Button small variant="secondary" onClick={() => navigate(`/chat/${log.conversationId}`)}>
                  看这场对话
                </Button>
              )}
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
