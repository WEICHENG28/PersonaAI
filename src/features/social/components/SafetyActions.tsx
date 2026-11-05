import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@components/ui/Button'
import { Modal } from '@components/ui/Modal'
import { useDemoStore } from '@store/useDemoStore'
import { REPORT_REASON_LABEL, blockUser, reportUser, type ReportReason } from '@lib/api/social'

/**
 * 聊天室上方的「屏蔽」「检举」（防濫用）。擁有者：B。
 * - 屏蔽：双方互相看不到、不能再开新对话，这段聊天结束。可以在「设置」取消。
 * - 检举：选原因（可补充说明），同时会屏蔽对方；多人检举的真人会先从大厅隐藏，由管理员处理。
 * 做完回到 AI 朋友页并跳通知。
 */
export function SafetyActions({ userId, name, conversationId, isSeed }: { userId: string; name: string; conversationId?: string; isSeed?: boolean }) {
  const navigate = useNavigate()
  const pushNotification = useDemoStore((s) => s.pushNotification)
  const [dialog, setDialog] = useState<'block' | 'report' | null>(null)
  const [reason, setReason] = useState<ReportReason>('harass')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    if (busy) return
    setDialog(null)
    setError(null)
  }

  const run = async (action: () => Promise<unknown>, title: string, body: string) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      setDialog(null)
      pushNotification({ title, body, ttlMs: 8_000 })
      navigate('/friend')
    } catch (e) {
      setError(e instanceof Error ? e.message : '没有成功，请再试一次')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <span style={{ display: 'inline-flex', gap: 'var(--space-2xs)' }}>
        <Button small variant="secondary" onClick={() => setDialog('block')}>
          屏蔽
        </Button>
        {/* 示范用户是 AI 扮演的，只给屏蔽 */}
        {!isSeed && (
          <Button small variant="secondary" onClick={() => setDialog('report')}>
            检举
          </Button>
        )}
      </span>

      <Modal open={dialog === 'block'} demo={false} onClose={close} title={`屏蔽「${name}」？`} sub="屏蔽后你们互相看不到，也不能再开新的聊天，这段聊天会结束。之后可以在「设置」取消屏蔽。">
        <div className="stack">
          {error && (
            <p className="chip chip--coral" role="alert">
              {error}
            </p>
          )}
          <div className="next-actions">
            <Button variant="secondary" disabled={busy} onClick={close}>
              再想想
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => void run(() => blockUser(userId), '已屏蔽', `你和「${name}」不会再互相看到`)}>
              {busy ? '处理中…' : '屏蔽'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={dialog === 'report'} demo={false} onClose={close} title={`检举「${name}」`} sub="我们会看这段聊天并处理。检举后也会帮你屏蔽对方。">
        <div className="stack">
          <label className="field">
            <span>原因</span>
            <select className="input" value={reason} onChange={(e) => setReason(e.target.value as ReportReason)} disabled={busy}>
              {(Object.keys(REPORT_REASON_LABEL) as ReportReason[]).map((r) => (
                <option key={r} value={r}>
                  {REPORT_REASON_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>补充说明（可以不填）</span>
            <textarea className="input" rows={3} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} />
          </label>
          {error && (
            <p className="chip chip--coral" role="alert">
              {error}
            </p>
          )}
          <div className="next-actions">
            <Button variant="secondary" disabled={busy} onClick={close}>
              取消
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                void run(
                  () => reportUser({ userId, reason, note: note.trim() || undefined, conversationId }),
                  '已收到你的检举',
                  `谢谢你告诉我们，也已经帮你屏蔽「${name}」`,
                )
              }
            >
              {busy ? '送出中…' : '送出检举'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
