import { useEffect, useState } from 'react'
import { Button } from '@components/ui/Button'
import { Card, CardHead } from '@components/ui/Card'
import { useDemoStore } from '@store/useDemoStore'
import { GUEST_KEEP_DAYS, accountStatus, setAccountPassword, type AccountStatus } from '@lib/api/account'

/**
 * 设置页「帐号」卡（http 模式）：
 * - 游客：设名字＋密码，变成正式帐号（记录都保留）。
 * - 旧的只有名字的帐号：设一个密码，之后用名字＋密码登录。
 * - 已有密码：可以修改密码。
 * 擁有者：A（設定頁），由 B 的 AI 依 Peter 需求撰寫。
 */
export function AccountCard() {
  const user = useDemoStore((s) => s.user)
  const login = useDemoStore((s) => s.login)
  const [status, setStatus] = useState<AccountStatus | null>(null)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    accountStatus().then(setStatus).catch(() => {})
  }, [])

  useEffect(() => {
    if (status?.guest) setName(user?.nickname ?? '')
  }, [status?.guest, user?.nickname])

  if (!status) return null

  const needsPassword = status.guest || !status.hasPassword
  const title = status.guest ? '游客帐号' : needsPassword ? '帐号还没设密码' : '帐号与密码'
  const sub = status.guest
    ? `游客记录只保留 ${GUEST_KEEP_DAYS} 天。设一个名字和密码就变成正式帐号，之前的记录都会保留`
    : needsPassword
      ? '设一个密码，之后用名字＋密码登录（没设的话换浏览器就回不来）'
      : `用「${user?.nickname ?? ''}」＋密码登录`

  const save = async () => {
    if (password !== password2) return setError('两次输入的密码不一样')
    setBusy(true)
    setError(null)
    try {
      const result = await setAccountPassword(password, status.guest ? name.trim() : undefined)
      if (status.guest && user && result.displayName) login(user.email, result.displayName, user.id)
      setStatus({ guest: false, hasPassword: true })
      setSaved(status.guest ? '已经是正式帐号了，下次用名字＋密码登录' : '密码已保存')
      setOpen(false)
      setPassword('')
      setPassword2('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，请再试一次')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card style={{ marginTop: 'var(--space-lg)' }}>
      <CardHead
        title={title}
        sub={sub}
        right={
          !open && (
            <Button small variant={needsPassword ? 'primary' : 'secondary'} onClick={() => (setOpen(true), setSaved(null))}>
              {status.guest ? '保留帐号' : needsPassword ? '设置密码' : '修改密码'}
            </Button>
          )
        }
      />
      {saved && <p className="hint-inline">{saved}</p>}
      {open && (
        <div style={{ display: 'grid', gap: 'var(--space-sm)', maxWidth: 360 }}>
          {status.guest && (
            <label className="field">
              <span>名字（别人会看到）</span>
              <input className="input" value={name} maxLength={20} autoComplete="username" onChange={(e) => setName(e.target.value)} />
            </label>
          )}
          <label className="field">
            <span>{needsPassword ? '密码' : '新密码'}</span>
            <input className="input" type="password" value={password} placeholder="至少 6 个字" maxLength={64} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="field">
            <span>再输入一次</span>
            <input className="input" type="password" value={password2} maxLength={64} autoComplete="new-password" onChange={(e) => setPassword2(e.target.value)} />
          </label>
          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}
          <div className="next-actions">
            <Button variant="secondary" disabled={busy} onClick={() => (setOpen(false), setError(null))}>
              取消
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              {busy ? '保存中…' : '保存'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
