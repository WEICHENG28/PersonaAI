import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@components/ui/Button'
import { t } from '@i18n/t'
import { ApiError, PURPOSE_LABEL, describeDone, getTask, updateTask, type TaskView } from '@lib/api/social'

/**
 * 任務確認卡（02 F12、07B B1）：顯示 Agent 對一句話任務的理解，用戶按「开始」才執行。
 * 用法：<TaskConfirmCard taskId={id} onStarted={...} onCancelled={...} />（A 的 AI 朋友聊天頁會放進來）
 */
export function TaskConfirmCard({
  taskId,
  onStarted,
  onCancelled,
}: {
  taskId: string
  onStarted?: (task: TaskView) => void
  onCancelled?: (task: TaskView) => void
}) {
  const [task, setTask] = useState<TaskView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  // 後端回「先到我的档案确认…并在设置开启社交 Agent」時，直接給兩個入口，不讓用戶卡住
  const needsSetup = Boolean(error && error.includes('我的档案'))

  useEffect(() => {
    let alive = true
    getTask(taskId)
      .then((t) => alive && setTask(t))
      .catch((e: unknown) => alive && setError(messageOf(e)))
    return () => {
      alive = false
    }
  }, [taskId])

  async function act(action: 'confirm' | 'cancel') {
    setBusy(true)
    setError(null)
    try {
      const next = await updateTask(taskId, action)
      setTask(next)
      if (action === 'confirm') onStarted?.(next)
      else onCancelled?.(next)
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  if (!task) {
    return <div className="card task-form">{error ? <p className="chip chip--coral">{error}</p> : <p>Agent 正在理解你的任务…</p>}</div>
  }

  const pending = task.status === 'pending_confirm'
  return (
    <div className="card task-form">
      <h3>{t('task.title')}</h3>
      <p>{task.restatement}</p>
      <dl className="task-grid">
        <div>
          <dt>{t('task.goal')}</dt>
          <dd>{PURPOSE_LABEL[task.purpose]}</dd>
        </div>
        <div>
          <dt>{t('task.condition')}</dt>
          <dd>{task.conditions.join('、') || '不限'}</dd>
        </div>
        <div>
          <dt>{t('task.count')}</dt>
          <dd>{task.target_count} 人</dd>
        </div>
        <div>
          <dt>{t('task.doneWhen')}</dt>
          <dd>{describeDone(task)}</dd>
        </div>
      </dl>
      {error && (
        <p className="chip chip--coral" role="alert">
          {error}
        </p>
      )}
      {needsSetup && (
        <div>
          <Button small variant="secondary" onClick={() => navigate('/profile')}>
            去确认对外档案
          </Button>
          <Button small variant="secondary" onClick={() => navigate('/settings')}>
            去设置开启社交 Agent
          </Button>
          <p>两步都完成后，到「我的任务」打开这个任务按确认就会开始，任务会保留。</p>
        </div>
      )}
      {pending ? (
        <div>
          <Button variant="secondary" disabled={busy} onClick={() => act('cancel')}>
            {t('task.cancel')}
          </Button>
          <Button disabled={busy} onClick={() => act('confirm')}>
            {t('task.confirm')}
          </Button>
        </div>
      ) : (
        <p>{task.status === 'running' ? t('task.statusRunning') : task.status === 'cancelled' ? '已取消' : task.status}</p>
      )}
    </div>
  )
}

function messageOf(e: unknown): string {
  return e instanceof ApiError ? e.message : '出了点问题，请稍后再试'
}
