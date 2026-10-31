import { useNavigate } from 'react-router'
import { Button, Chip } from '@components/ui/Button'
import { Card, CardHead } from '@components/ui/Card'
import { useDemoStore } from '@store/useDemoStore'
import { t } from '@i18n/t'
import { suitableTarget } from '@demo/taskDraft'

/** mock 模式「我的任务」（UX #16）：显示 demo store 的任务；没有任务时引导去找阿澈交办。 */
export function DemoTaskList() {
  const navigate = useNavigate()
  const task = useDemoStore((s) => s.task)
  const proxyStarted = useDemoStore((s) => s.proxyTick > 0)
  const proxyDone = useDemoStore((s) => s.proxyDone)

  if (!task) {
    return (
      <div className="stack">
        <p className="empty">还没有任务。跟阿澈说一句「帮我找 3 个喜欢登山的人聊聊」就会开始。</p>
        <div className="next-actions">
          <Button onClick={() => navigate('/friend')}>去跟阿澈交办</Button>
        </div>
      </div>
    )
  }

  const target = suitableTarget(task.count)
  const status =
    task.status === 'running'
      ? { label: t('task.statusRunning'), tone: 'mint' as const }
      : task.status === 'done'
        ? { label: t('task.statusDone'), tone: 'ink' as const }
        : { label: t('task.statusPaused'), tone: 'well' as const }

  return (
    <Card>
      <CardHead title={`找 ${task.count} 个${task.condition === '不限' ? '' : `${task.condition}的`}人`} right={<Chip tone={status.tone}>{status.label}</Chip>} />
      <dl className="task-grid">
        <div>
          <dt>{t('task.goal')}</dt>
          <dd>{task.goal}</dd>
        </div>
        <div>
          <dt>{t('task.condition')}</dt>
          <dd>{task.condition}</dd>
        </div>
        <div>
          <dt>{t('task.doneWhen')}</dt>
          <dd>{task.doneWhen}</dd>
        </div>
        <div>
          <dt>{t('task.progress')}</dt>
          <dd>{t('task.progressOf', { done: task.progress, total: target })}</dd>
        </div>
      </dl>
      <div className="grow" style={{ ['--g' as string]: String(Math.min(1, task.progress / target)) }} />
      <div className="hist-actions">
        {proxyStarted && (
          <Button small variant="secondary" onClick={() => navigate(proxyDone ? '/chat/lin/result' : '/chat/lin')}>
            {proxyDone ? t('proxyChat.resultLink') : '看代聊（进行中）'}
          </Button>
        )}
        {task.status === 'paused' && <em className="hint-inline">社交 Agent 已关闭，到设置重新开启就会继续。</em>}
      </div>
    </Card>
  )
}
