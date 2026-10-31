import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AgentLogPanel } from '@components/AgentLogPanel'
import { Button, Chip } from '@components/ui/Button'
import { Card, CardHead } from '@components/ui/Card'
import { LoadingDots } from '@components/ui/LoadingDots'
import { t } from '@i18n/t'
import {
  ApiError,
  PURPOSE_LABEL,
  describeDone,
  getTask,
  getTaskStats,
  historyFromApi,
  listTasks,
  subscribeTask,
  updateTask,
  type TaskAction,
  type TaskStatsView,
  type TaskView,
} from '@lib/api/social'
import { StatsCard } from './components/StatsCard'

const STATUS: Record<TaskView['status'], { label: string; tone: 'mint' | 'pear' | 'well' | 'coral' | 'ink' }> = {
  pending_confirm: { label: '待确认', tone: 'pear' },
  running: { label: '进行中', tone: 'mint' },
  paused: { label: '已暂停', tone: 'well' },
  done: { label: '已完成', tone: 'ink' },
  failed: { label: '失败', tone: 'coral' },
  cancelled: { label: '已取消', tone: 'well' },
}

/** 画面：我的任务（B10）。/tasks 列表，/tasks/:id 任务详情。只在 http 模式有真资料。 */
export function TaskPage() {
  const { id } = useParams()
  return (
    <div className="page">
      {!historyFromApi ? (
        <p className="empty">Demo 模式没有真实任务，请到 AI 朋友页看示范的任务卡。</p>
      ) : id ? (
        <TaskDetail id={id} />
      ) : (
        <TaskList />
      )}
    </div>
  )
}

function TaskList() {
  const [tasks, setTasks] = useState<TaskView[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listTasks()
      .then(setTasks)
      .catch((e: unknown) => setError(messageOf(e)))
  }, [])

  if (error) return <ErrorText text={error} />
  if (!tasks) return <LoadingDots label="加载任务中" />
  if (tasks.length === 0) return <p className="empty">还没有任务。跟阿澈说一句「帮我找 3 个喜欢登山的人聊聊」就会开始。</p>

  return (
    <div className="stack">
      {tasks.map((task) => (
        <Card key={task.id}>
          <CardHead title={task.restatement ?? task.raw_instruction ?? '任务'} right={<Chip tone={STATUS[task.status].tone}>{STATUS[task.status].label}</Chip>} />
          <p className="hist-line">
            合适 {task.progress.suitable} / {task.done_condition.suitable_count ?? task.target_count} 位 · 代聊 {task.progress.chats} 场
          </p>
          <Link to={`/tasks/${task.id}`}>看进度</Link>
        </Card>
      ))}
    </div>
  )
}

function TaskDetail({ id }: { id: string }) {
  const navigate = useNavigate()
  const [task, setTask] = useState<TaskView | null>(null)
  const [stats, setStats] = useState<TaskStatsView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getTask(id)
      .then(setTask)
      .catch((e: unknown) => setError(messageOf(e)))
    // 進度一變就更新畫面（worker 每推進一步都會改 agent_tasks）
    return subscribeTask(id, (next) => setTask((prev) => (prev ? { ...prev, ...next } : next)))
  }, [id])

  // 進度變了就重新算效率統計
  const chats = task?.progress.chats
  useEffect(() => {
    if (chats === undefined) return
    getTaskStats(id)
      .then(setStats)
      .catch(() => {})
  }, [id, chats])

  async function act(action: TaskAction) {
    setBusy(true)
    setError(null)
    try {
      setTask(await updateTask(id, action))
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  if (!task) return error ? <ErrorText text={error} /> : <LoadingDots label="加载任务详情中" />

  const target = task.done_condition.suitable_count ?? task.target_count
  const active = task.status === 'running' || task.status === 'paused' || task.status === 'pending_confirm'
  return (
    <div className="stack">
      <Card>
        <CardHead title={task.restatement ?? task.raw_instruction ?? '任务'} right={<Chip tone={STATUS[task.status].tone}>{STATUS[task.status].label}</Chip>} />
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
            <dt>{t('task.doneWhen')}</dt>
            <dd>{describeDone(task)}</dd>
          </div>
          <div>
            <dt>{t('task.progress')}</dt>
            <dd>
              合适 {task.progress.suitable} / {target} 位
            </dd>
          </div>
        </dl>
        <div className="grow" style={{ ['--g' as string]: String(Math.min(1, task.progress.suitable / Math.max(1, target))) }} />
        {error && <ErrorText text={error} />}
        <div className="hist-actions">
          {task.active_conversation_id && (
            <Button small variant="secondary" onClick={() => navigate(`/chat/${task.active_conversation_id}`)}>
              看正在进行的代聊
            </Button>
          )}
          {task.status === 'pending_confirm' && (
            <Button small disabled={busy} onClick={() => act('confirm')}>
              {t('task.confirm')}
            </Button>
          )}
          {task.status === 'running' && (
            <Button small variant="secondary" disabled={busy} onClick={() => act('pause')}>
              暂停
            </Button>
          )}
          {task.status === 'paused' && (
            <Button small disabled={busy} onClick={() => act('resume')}>
              继续
            </Button>
          )}
          {active && (
            <Button small variant="danger" disabled={busy} onClick={() => act('cancel')}>
              取消任务
            </Button>
          )}
        </div>
      </Card>

      {stats && <StatsCard screened={stats.screened} chats={stats.chats} suitable={stats.suitable} savedMinutes={stats.saved_minutes} basis={stats.basis} />}

      <AgentLogPanel taskId={id} />
    </div>
  )
}

function ErrorText({ text }: { text: string }) {
  return (
    <p className="chip chip--coral" role="alert">
      {text}
    </p>
  )
}

function messageOf(e: unknown): string {
  return e instanceof ApiError ? e.message : t('login.errorGeneric')
}
