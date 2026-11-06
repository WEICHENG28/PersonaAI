import { useState } from 'react'
import { Button, Chip } from '@components/ui/Button'
import { Card, CardHead } from '@components/ui/Card'
import { adminApi, type AdminError, type AdminReport, type AdminUser } from '@lib/api/admin'
import { PanelStatus, useAdminData } from './adminData'

const time = (iso: string) => new Date(iso).toLocaleString('zh-CN', { hour12: false })

/** 停用／恢复按钮（会先确认一次）。 */
function BanButton({ userId, name, banned, onChanged }: { userId: string; name: string; banned: boolean; onChanged(): void }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const act = async () => {
    setBusy(true)
    setError(null)
    try {
      await adminApi.ban(userId, !banned, banned ? '管理员恢复' : '管理员从后台停用')
      setConfirming(false)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : '没有成功')
    } finally {
      setBusy(false)
    }
  }
  if (!confirming) {
    return (
      <Button small variant={banned ? 'secondary' : 'danger'} onClick={() => setConfirming(true)}>
        {banned ? '恢复帐号' : '停用帐号'}
      </Button>
    )
  }
  return (
    <span style={{ display: 'inline-flex', gap: 'var(--space-2xs)', alignItems: 'center', flexWrap: 'wrap' }}>
      <span className="hint-inline">{banned ? `恢复「${name}」？` : `停用「${name}」？对方会不能登录、从大厅消失`}</span>
      <Button small variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
        取消
      </Button>
      <Button small variant={banned ? 'primary' : 'danger'} disabled={busy} onClick={() => void act()}>
        确定
      </Button>
      {error && <span className="login-error">{error}</span>}
    </span>
  )
}

export function ReportsPanel({ onAuthError }: { onAuthError(e: unknown): void }) {
  const { data, error, loading, reload } = useAdminData<AdminReport[]>(adminApi.reports, onAuthError)
  // 依被检举的人分组：看谁被多人检举
  const byTarget = new Map<string, { name: string; reports: AdminReport[] }>()
  for (const r of data ?? []) {
    if (!r.target.id) continue
    const g = byTarget.get(r.target.id) ?? { name: r.target.name ?? '已删除的用户', reports: [] }
    g.reports.push(r)
    byTarget.set(r.target.id, g)
  }
  const groups = [...byTarget.entries()].sort((a, b) => b[1].reports.length - a[1].reports.length)
  return (
    <div>
      <PanelStatus loading={loading} error={error} reload={reload} />
      {data && groups.length === 0 && <p className="empty">目前没有检举</p>}
      <div className="stack">
        {groups.map(([id, g]) => (
          <Card key={id} className="stack">
            <CardHead
              title={g.name}
              sub={`被检举 ${g.reports.length} 次（${new Set(g.reports.map((r) => r.reporter.id)).size} 位用户）`}
              right={<BanButton userId={id} name={g.name} banned={false} onChanged={reload} />}
            />
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {g.reports.map((r, i) => (
                <li key={i} style={{ borderTop: '1px solid var(--color-rule)', paddingTop: 'var(--space-xs)' }}>
                  <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap', alignItems: 'center' }}>
                    <Chip tone="coral">{r.reason ?? '其他'}</Chip>
                    <span className="hint-inline">
                      {r.reporter.name ?? '已删除的用户'} 检举 · {time(r.at)}
                    </span>
                  </div>
                  {r.note && <p>{r.note}</p>}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  )
}

export function UsersPanel({ onAuthError }: { onAuthError(e: unknown): void }) {
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const { data, error, loading, reload } = useAdminData<AdminUser[]>(() => adminApi.users(q), onAuthError, [q])
  return (
    <div>
      <div style={{ display: 'flex', gap: 'var(--space-xs)', marginBottom: 'var(--space-sm)' }}>
        <input className="input" placeholder="用名字找（留空＝最新的 20 位）" value={draft} maxLength={40} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setQ(draft.trim())} />
        <Button onClick={() => setQ(draft.trim())}>搜索</Button>
      </div>
      <PanelStatus loading={loading} error={error} reload={reload} />
      {data && data.length === 0 && <p className="empty">找不到用户</p>}
      <div className="stack">
        {(data ?? []).map((u) => (
          <Card key={u.id} className="stack" style={{ gap: 'var(--space-xs)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 'var(--text-lg)' }}>{u.name}</strong>
              {u.banned && <Chip tone="coral">已停用</Chip>}
              <Chip tone={u.guest ? 'pear' : 'ink'}>{u.guest ? '游客' : u.hasPassword ? '正式帐号' : '没设密码'}</Chip>
              {u.inLobby && <Chip tone="mint">在大厅</Chip>}
              {u.reportedBy > 0 && <Chip tone="coral">被 {u.reportedBy} 人检举</Chip>}
              <span style={{ marginLeft: 'auto' }}>
                <BanButton userId={u.id} name={u.name} banned={u.banned} onChanged={reload} />
              </span>
            </div>
            <span className="hint-inline">
              建立于 {time(u.createdAt)} · 和阿澈说了 {u.friendMessages} 句
            </span>
          </Card>
        ))}
      </div>
    </div>
  )
}

const SOURCE_LABEL: Record<AdminError['source'], string> = { server: '后端', web: '网页', worker: 'worker' }

export function ErrorsPanel({ onAuthError }: { onAuthError(e: unknown): void }) {
  const { data, error, loading, reload } = useAdminData<AdminError[]>(adminApi.errors, onAuthError)
  return (
    <div>
      <PanelStatus loading={loading} error={error} reload={reload} />
      <Card className="stack">
        <CardHead title="最近错误" sub="这台服务器记得的最近 50 种错误（Vercel 有多台机器，完整纪录请看 Vercel 的 Logs）。设了 ALERT_WEBHOOK_URL 会同时推到群组" />
        {data && data.length === 0 && <p className="empty">最近没有错误</p>}
        <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {(data ?? []).map((e, i) => (
            <li key={i} style={{ borderTop: i ? '1px solid var(--color-rule)' : undefined, paddingTop: i ? 'var(--space-xs)' : 0 }}>
              <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap', alignItems: 'center' }}>
                <Chip tone="ink">{SOURCE_LABEL[e.source]}</Chip>
                <strong>{e.where}</strong>
                <span className="hint-inline">
                  {time(e.at)}
                  {e.count > 1 ? ` · 发生 ${e.count} 次` : ''}
                </span>
              </div>
              <p style={{ wordBreak: 'break-word' }}>{e.message}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
