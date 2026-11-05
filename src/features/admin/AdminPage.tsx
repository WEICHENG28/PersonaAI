import { useState, type ReactNode } from 'react'
import { Button, Chip } from '@components/ui/Button'
import { Card, CardHead } from '@components/ui/Card'
import { isHttpMode } from '@lib/api/friend'
import { AdminAuthError, adminApi, getAdminSecret, setAdminSecret, type AdminOverview, type FunnelRow } from '@lib/api/admin'
import { ErrorsPanel, ReportsPanel, UsersPanel } from './AdminPanels'
import { PanelStatus, useAdminData } from './adminData'

type Tab = 'overview' | 'funnel' | 'reports' | 'users' | 'errors'
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: '概况' },
  { key: 'funnel', label: '新手漏斗' },
  { key: 'reports', label: '检举' },
  { key: 'users', label: '用户' },
  { key: 'errors', label: '错误' },
]

/**
 * 管理后台 /admin（http 模式）：概况、新手漏斗、检举处理、用户查询与停用、最近错误。
 * 不用一般帐号登录，要输入管理密码（Vercel 环境变量 ADMIN_SECRET）。擁有者：B。
 */
export function AdminPage() {
  const [authed, setAuthed] = useState(() => Boolean(getAdminSecret()))
  const [tab, setTab] = useState<Tab>('overview')

  if (!isHttpMode) {
    return (
      <div className="page">
        <Card>
          <CardHead title="管理后台" sub="Demo 模式没有后端，请在正式网站使用" />
        </Card>
      </div>
    )
  }
  if (!authed) return <SecretGate onDone={() => setAuthed(true)} />

  const logout = () => {
    setAdminSecret(null)
    setAuthed(false)
  }
  const onAuthError = (e: unknown) => {
    if (e instanceof AdminAuthError) logout()
  }

  return (
    <div className="page">
      <div className="page-head" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
        <h1>管理后台</h1>
        <span style={{ marginLeft: 'auto' }}>
          <Button small variant="secondary" onClick={logout}>
            退出管理
          </Button>
        </span>
      </div>
      <div className="login-tabs" role="tablist" style={{ gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))`, marginBottom: 'var(--space-lg)' }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`login-tab ${tab === t.key ? 'is-on' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'overview' && <OverviewPanel onAuthError={onAuthError} />}
      {tab === 'funnel' && <FunnelPanel onAuthError={onAuthError} />}
      {tab === 'reports' && <ReportsPanel onAuthError={onAuthError} />}
      {tab === 'users' && <UsersPanel onAuthError={onAuthError} />}
      {tab === 'errors' && <ErrorsPanel onAuthError={onAuthError} />}
    </div>
  )
}

function SecretGate({ onDone }: { onDone(): void }) {
  const [secret, setSecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    setError(null)
    setAdminSecret(secret.trim())
    try {
      await adminApi.errors()
      onDone()
    } catch (e) {
      setAdminSecret(null)
      setError(e instanceof Error ? e.message : '无法进入')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="page">
      <Card className="stack" style={{ maxWidth: 420, margin: '0 auto' }}>
        <CardHead title="管理后台" sub="输入管理密码（Vercel 环境变量 ADMIN_SECRET）" />
        <input className="input" type="password" value={secret} autoComplete="off" onChange={(e) => setSecret(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !busy && void submit()} />
        {error && <p className="login-error">{error}</p>}
        <Button block disabled={busy || !secret.trim()} onClick={() => void submit()}>
          {busy ? '检查中…' : '进入'}
        </Button>
      </Card>
    </div>
  )
}

function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <Card className="stack" style={{ gap: 'var(--space-2xs)' }}>
      <span className="hint-inline">{label}</span>
      <strong style={{ fontSize: 'var(--text-2xl)', lineHeight: 1.1, color: 'var(--color-ink)' }}>{value}</strong>
      {note && <span className="hint-inline">{note}</span>}
    </Card>
  )
}

function healthChip(label: string, value: string) {
  const ok = value === 'ok'
  return (
    <Chip tone={ok ? 'mint' : 'coral'}>
      {label}：{ok ? '正常' : value === 'missing_env' ? '缺少设定' : '异常'}
    </Chip>
  )
}

function OverviewPanel({ onAuthError }: { onAuthError(e: unknown): void }) {
  const { data, error, loading, reload } = useAdminData<AdminOverview>(adminApi.overview, onAuthError)
  return (
    <div>
      <PanelStatus loading={loading} error={error} reload={reload} />
      {data && (
        <div className="stack">
          <div style={{ display: 'grid', gap: 'var(--space-md)', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <Stat label="真人用户" value={data.users} note={`24 小时新增 ${data.newUsers24h}`} />
            <Stat label="24 小时活跃" value={data.activeUsers24h} note="和阿澈说过话的人" />
            <Stat label="在大厅" value={data.inLobby} note="开着社交 Agent" />
            <Stat label="和阿澈的消息" value={data.friendMessages24h} note="24 小时，用户发的" />
            <Stat label="聊天室消息" value={data.liveMessages24h} note="24 小时，本人发的" />
            <Stat label="找人任务" value={data.tasks24h} note="24 小时新建" />
            <Stat label="检举" value={data.reports7d} note="最近 7 天" />
          </div>
          <Card className="stack">
            <CardHead title="服务状态" sub="数据库和 AI 平台连不连得上（每次打开概况检查一次）" />
            <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
              {healthChip('数据库', data.health.database)}
              {healthChip('AI 平台', data.health.llm)}
            </div>
            {data.health.missingEnv.length > 0 && <p className="login-error">缺少环境变量：{data.health.missingEnv.join('、')}</p>}
          </Card>
        </div>
      )}
    </div>
  )
}

function FunnelPanel({ onAuthError }: { onAuthError(e: unknown): void }) {
  const [days, setDays] = useState(30)
  const { data, error, loading, reload } = useAdminData(() => adminApi.funnel(days), onAuthError, [days])
  const rows: FunnelRow[] = data?.funnel ?? []
  return (
    <div>
      <div style={{ display: 'flex', gap: 'var(--space-xs)', marginBottom: 'var(--space-sm)', flexWrap: 'wrap' }}>
        {[7, 30, 90].map((d) => (
          <Button key={d} small variant={days === d ? 'primary' : 'secondary'} onClick={() => setDays(d)}>
            最近 {d} 天
          </Button>
        ))}
      </div>
      <PanelStatus loading={loading} error={error} reload={reload} />
      <Card className="stack">
        <CardHead title="新手漏斗" sub={`最近 ${days} 天建立的真人帐号，每一步有多少人走到（不含示范用户）`} />
        {rows.length > 0 && rows[0]!.users === 0 && <p className="empty">这段时间还没有新用户</p>}
        <ol className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {rows.map((r, i) => {
            const lost = i > 0 ? rows[i - 1]!.users - r.users : 0
            return (
              <li key={r.step} className="stack" style={{ gap: 'var(--space-2xs)' }}>
                <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span>{r.label}</span>
                  <strong style={{ marginLeft: 'auto' }}>
                    {r.users} 人 · {r.percent}%
                  </strong>
                </div>
                <div style={{ height: 12, borderRadius: 4, background: 'var(--color-paper-3)' }} title={`${r.label}：${r.users} 人（${r.percent}%）`}>
                  <div style={{ width: `${r.percent}%`, minWidth: r.users ? 4 : 0, height: '100%', borderRadius: 4, background: 'var(--color-leaf)' }} />
                </div>
                {lost > 0 && <span className="hint-inline">比上一步少 {lost} 人</span>}
              </li>
            )
          })}
        </ol>
      </Card>
    </div>
  )
}
