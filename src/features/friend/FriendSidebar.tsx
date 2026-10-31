import { useNavigate } from 'react-router'
import { Button } from '@components/ui/Button'
import { Card, CardHead } from '@components/ui/Card'
import { useDemoStore } from '@store/useDemoStore'
import { t } from '@i18n/t'
import { isHttpMode } from '@lib/api/friend'
import { suitableTarget } from '@demo/taskDraft'
import { MemoryList } from './MemoryList'
import { useMemories } from './useMemories'

/** 聊满几句才能交办任务 */
export const REPLIES_BEFORE_TASK = 5

interface FriendSidebarProps {
  /** 用户已说的句数（mock 来自 store，http 来自后端讯息） */
  userCount: number
  taskText: string
  onOpenTaskDraft: () => void
  /** 显示「模拟下次见面」 */
  showNextMeet: boolean
  nextMeetLoading: boolean
  onNextMeet: () => void
}

/** 朋友页侧栏：它记得的事 + 任务区 + 模拟下次见面 */
export function FriendSidebar(props: FriendSidebarProps) {
  const memories = useMemories()
  return (
    <div className="friend-side stack">
      <Card>
        <CardHead title={t('friend.memoriesTitle')} sub={t('friend.memoriesHint')} />
        <MemoryList state={memories} />
      </Card>

      <TaskArea {...props} />

      {props.showNextMeet && (
        <Button small variant="secondary" block onClick={props.onNextMeet} disabled={props.nextMeetLoading}>
          {props.nextMeetLoading ? t('login.loading') : t('friend.nextMeet')}
          <em className="hint-inline">{t('friend.nextMeetHint')}</em>
        </Button>
      )}
    </div>
  )
}

function TaskArea({ userCount, taskText, onOpenTaskDraft }: FriendSidebarProps) {
  const task = useDemoStore((s) => (isHttpMode ? null : s.task))
  const canAssign = userCount >= REPLIES_BEFORE_TASK

  if (task) return <DemoTaskMini />

  return (
    <Card>
      <CardHead title={t('friend.taskCard')} />
      {!canAssign ? (
        <p className="empty">跟阿澈多聊几句（还差 {REPLIES_BEFORE_TASK - userCount} 则），就能交办任务。</p>
      ) : isHttpMode ? (
        <p className="task-entry">直接在聊天里跟阿澈说：「{taskText}」，它会生成任务确认卡。</p>
      ) : (
        <div className="task-entry">
          <p>试试跟阿澈说：「{taskText}」</p>
          <Button small variant="secondary" block onClick={onOpenTaskDraft}>
            生成{t('friend.taskCard')}
          </Button>
        </div>
      )}
    </Card>
  )
}

/** mock：已确认的任务（UX #17、#29、#30） */
function DemoTaskMini() {
  const navigate = useNavigate()
  const task = useDemoStore((s) => s.task)!
  const proxyStarted = useDemoStore((s) => s.proxyTick > 0)
  const proxyDone = useDemoStore((s) => s.proxyDone)
  const target = suitableTarget(task.count)
  const statusLabel =
    task.status === 'running' ? t('task.statusRunning') : task.status === 'done' ? t('task.statusDone') : t('task.statusPaused')

  return (
    <Card>
      <CardHead title={`${t('friend.taskRunningTitle')} · ${statusLabel}`} />
      <div className="task-mini">
        <p>
          {t('task.goal')}：{task.goal} · {t('task.condition')}：{task.condition} · {t('task.count')}：{task.count}{' '}
          {t('report.statUnit')}
        </p>
        <p className="task-mini__done">
          {t('task.doneWhen')}：{task.doneWhen}
        </p>
        <div className="grow" style={{ ['--g' as string]: String(Math.min(1, task.progress / target)) }} />
        <p className="task-mini__progress">
          {t('task.progress')}：{t('task.progressOf', { done: task.progress, total: target })}
        </p>
        {task.status === 'paused' && <p className="hint-inline">社交 Agent 已关闭，任务暂停中；到设置重新开启就会继续。</p>}
        {proxyDone ? (
          <Button small block onClick={() => navigate('/chat/lin/result')}>
            {t('proxyChat.resultLink')}
          </Button>
        ) : (
          proxyStarted && (
            <Button small variant="secondary" block onClick={() => navigate('/chat/lin')}>
              看分身代聊（进行中）
            </Button>
          )
        )}
      </div>
    </Card>
  )
}
