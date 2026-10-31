import { Button } from '@components/ui/Button'
import { Modal } from '@components/ui/Modal'
import { t } from '@i18n/t'
import { parseTaskDraft, type TaskDraft } from '@demo/taskDraft'

interface TaskConfirmModalProps {
  open: boolean
  text: string
  onText: (v: string) => void
  onCancel: () => void
  onConfirm: (draft: TaskDraft) => void
}

/** mock 模式的任务确认卡（UX #4）：下面的栏位跟着「一句话交办」即时解析。 */
export function TaskConfirmModal({ open, text, onText, onCancel, onConfirm }: TaskConfirmModalProps) {
  const draft = parseTaskDraft(text)
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={t('task.title')}
      sub={t('task.subtitle')}
      demo
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {t('task.cancel')}
          </Button>
          <Button onClick={() => onConfirm(draft)} disabled={!text.trim()}>
            {t('task.confirm')}
          </Button>
        </>
      }
    >
      <div className="task-form">
        <label className="field">
          <span>一句话交办</span>
          <input className="input" value={text} onChange={(e) => onText(e.target.value)} />
        </label>
        <dl className="task-grid">
          <div>
            <dt>{t('task.goal')}</dt>
            <dd>{draft.goal}</dd>
          </div>
          <div>
            <dt>{t('task.condition')}</dt>
            <dd>{draft.condition}</dd>
          </div>
          <div>
            <dt>{t('task.count')}</dt>
            <dd>{draft.count} 人</dd>
          </div>
          <div>
            <dt>{t('task.doneWhen')}</dt>
            <dd>{draft.doneWhen}</dd>
          </div>
        </dl>
        {!draft.isDemoScript && <p className="hint-inline task-form__note">演示只有「登山」示范剧本，正式版会按你的描述找人</p>}
      </div>
    </Modal>
  )
}
