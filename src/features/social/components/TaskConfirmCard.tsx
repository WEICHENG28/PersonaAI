import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@components/ui/Button'
import { t } from '@i18n/t'
import {
  ApiError,
  PURPOSE_LABEL,
  describeDone,
  editTask,
  getTask,
  updateTask,
  type TaskEdit,
  type TaskPurpose,
  type TaskView,
} from '@lib/api/social'

import { MAX_CHATS, MAX_COUNT, clamp, normalize, splitConditions } from '../taskEdit'

/**
 * 任務確認卡（02 F12、07B B1）：顯示 Agent 對一句話任務的理解，用戶按「开始」才執行。
 * 待確認時每一欄都能改：目的、條件、人數、找到幾位就停、最多代聊幾場（數字可以按 −／＋ 或直接輸入）。
 * 用法：<TaskConfirmCard taskId={id} onStarted={...} onCancelled={...} />（A 的 AI 朋友聊天頁會放進來）
 * 有給 onLater 時，「再想想」只關掉卡片、任務留在「我的任务」等確認（有改過的內容會先存）；沒給才是取消任務。
 */
export function TaskConfirmCard({
  taskId,
  onStarted,
  onCancelled,
  onLater,
}: {
  taskId: string
  onStarted?: (task: TaskView) => void
  onCancelled?: (task: TaskView) => void
  onLater?: (task: TaskView) => void
}) {
  const [task, setTask] = useState<TaskView | null>(null)
  const [draft, setDraft] = useState<TaskEdit | null>(null)
  const [condText, setCondText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  // 後端回「先到我的档案确认…并在设置开启社交 Agent」時，直接給兩個入口，不讓用戶卡住
  const needsSetup = Boolean(error && error.includes('我的档案'))

  useEffect(() => {
    let alive = true
    getTask(taskId)
      .then((loaded) => {
        if (!alive) return
        setTask(loaded)
        setDraft(toEdit(loaded))
        setCondText(loaded.conditions.join('、'))
      })
      .catch((e: unknown) => alive && setError(messageOf(e)))
    return () => {
      alive = false
    }
  }, [taskId])

  /** 有改過就先存，回傳最新的任務。 */
  async function saveIfChanged(current: TaskView): Promise<TaskView> {
    if (!draft) return current
    const edit = normalize({ ...draft, conditions: splitConditions(condText) })
    if (sameEdit(edit, toEdit(current))) return current
    const saved = await editTask(current.id, edit)
    setTask(saved)
    return saved
  }

  async function act(action: 'confirm' | 'cancel' | 'later') {
    if (!task) return
    setBusy(true)
    setError(null)
    try {
      if (action === 'cancel') {
        const next = await updateTask(taskId, 'cancel')
        setTask(next)
        onCancelled?.(next)
        return
      }
      const saved = await saveIfChanged(task)
      if (action === 'later') {
        onLater?.(saved)
        return
      }
      const next = await updateTask(taskId, 'confirm')
      setTask(next)
      onStarted?.(next)
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  if (!task || !draft) {
    return <div className="card task-form">{error ? <p className="chip chip--coral">{error}</p> : <p>Agent 正在理解你的任务…</p>}</div>
  }

  const pending = task.status === 'pending_confirm'
  const set = (patch: Partial<TaskEdit>) => setDraft(normalize({ ...draft, ...patch }))
  const preview = pending ? restate({ ...draft, conditions: splitConditions(condText) }) : task.restatement

  return (
    <div className="card task-form">
      <h3>{t('task.title')}</h3>
      <p>{preview}</p>
      {pending ? (
        <div className="task-grid task-grid--edit">
          <label className="field">
            <span>{t('task.goal')}</span>
            <select className="input" value={draft.purpose} onChange={(e) => set({ purpose: e.target.value as TaskPurpose })} disabled={busy}>
              {(Object.keys(PURPOSE_LABEL) as TaskPurpose[]).map((p) => (
                <option key={p} value={p}>
                  {PURPOSE_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('task.condition')}（用「、」分开，可以留空）</span>
            <input className="input" value={condText} maxLength={80} placeholder="不限" onChange={(e) => setCondText(e.target.value)} disabled={busy} />
          </label>
          <Stepper label={`${t('task.count')}（人）`} value={draft.count} min={1} max={MAX_COUNT} onChange={(count) => set({ count })} disabled={busy} />
          <Stepper
            label="找到几位合适就停"
            value={draft.suitable_count}
            min={1}
            max={draft.count}
            onChange={(suitable_count) => set({ suitable_count })}
            disabled={busy}
          />
          <Stepper
            label="最多代聊几场"
            value={draft.max_chats}
            min={draft.suitable_count}
            max={MAX_CHATS}
            onChange={(max_chats) => set({ max_chats })}
            disabled={busy}
          />
        </div>
      ) : (
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
      )}
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
          <Button variant="secondary" disabled={busy} onClick={() => void act(onLater ? 'later' : 'cancel')}>
            {t('task.cancel')}
          </Button>
          <Button disabled={busy} onClick={() => void act('confirm')}>
            {t('task.confirm')}
          </Button>
        </div>
      ) : (
        <p>{task.status === 'running' ? t('task.statusRunning') : task.status === 'cancelled' ? '已取消' : task.status}</p>
      )}
    </div>
  )
}

/** 數字欄：− 和 ＋ 按鈕，也可以直接輸入；離開欄位時夾回合理範圍。 */
function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  disabled,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (n: number) => void
  disabled?: boolean
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const commit = (raw: string) => {
    const n = Number.parseInt(raw, 10)
    const next = Number.isFinite(n) ? clamp(n, min, max) : value
    setText(String(next))
    if (next !== value) onChange(next)
  }
  return (
    <div className="field">
      <span>{label}</span>
      <div style={{ display: 'flex', gap: 'var(--space-2xs)', alignItems: 'center' }}>
        <Button small variant="secondary" aria-label={`${label}减一`} disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>
          −
        </Button>
        <input
          className="input"
          inputMode="numeric"
          style={{ width: '4.5rem', textAlign: 'center' }}
          value={text}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ''))}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commit((e.target as HTMLInputElement).value)}
        />
        <Button small variant="secondary" aria-label={`${label}加一`} disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>
          ＋
        </Button>
      </div>
    </div>
  )
}

function toEdit(task: TaskView): TaskEdit {
  const count = task.target_count
  const suitable = task.done_condition.suitable_count ?? Math.min(count, 2)
  return {
    purpose: task.purpose,
    conditions: task.conditions,
    count,
    suitable_count: suitable,
    max_chats: task.done_condition.max_chats ?? count * 2,
  }
}

function sameEdit(a: TaskEdit, b: TaskEdit): boolean {
  return (
    a.purpose === b.purpose &&
    a.count === b.count &&
    a.suitable_count === b.suitable_count &&
    a.max_chats === b.max_chats &&
    a.conditions.join('、') === b.conditions.join('、')
  )
}

/** 和後端 restateTask 同一句話（畫面上即時預覽）。 */
function restate(e: TaskEdit): string {
  const cond = e.conditions.length ? `${e.conditions.join('、')}的` : ''
  return `帮你找 ${e.count} 位${cond}${PURPOSE_LABEL[e.purpose]}，找到 ${e.suitable_count} 位合适就停，最多代聊 ${e.max_chats} 场，可以吗？`
}


function messageOf(e: unknown): string {
  return e instanceof ApiError ? e.message : '出了点问题，请稍后再试'
}
