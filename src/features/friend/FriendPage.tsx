import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ChatBubble } from '@components/ui/ChatBubble'
import { Button, Chip } from '@components/ui/Button'
import { Card, CardHead } from '@components/ui/Card'
import { RiveAvatar } from '@components/ui/RiveAvatar'
import { Modal } from '@components/ui/Modal'
import { useDemoStore } from '@store/useDemoStore'
import { useAutoScrollBottom } from '@hooks/useAutoScrollBottom'
import { t } from '@i18n/t'
import { AgentLogPanel } from '@components/AgentLogPanel'

/** 画面 2-4：AI 朋友聊天 + 记忆侧栏 + 任务确认 + 回报 */
export function FriendPage() {
  const s = useDemoStore()
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')
  const [taskDraftOpen, setTaskDraftOpen] = useState(false)
  const [taskText, setTaskText] = useState('帮我找 3 个喜欢登山的人聊聊')
  const chatRef = useAutoScrollBottom<HTMLDivElement>(s.friendMessages.length)

  const send = () => {
    if (!draft.trim() || s.friendTyping) return
    s.sendFriendMessage(draft.trim())
    setDraft('')
  }

  const canAssignTask = s.userReplyCount >= 5

  const openReport = () => {
    s.dismissReport()
    navigate('/chat/lin/result')
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('friend.title')}</h1>
        <p>
          {t('friend.subtitle')} · <Chip tone="well">{t('friend.demoTag')}</Chip>
        </p>
      </div>

      <div className="friend-layout">
        {/* 聊天主栏 */}
        <Card className="friend-chat">
          <div className="friend-chat__head">
            <RiveAvatar name="robot" size={44} />
            <div>
              <strong>{t('friend.title')}</strong>
              <span>{s.friendTyping ? t('friend.typing') : t('friend.subtitle')}</span>
            </div>
            {s.reportReady && <Chip tone="pear">{t('friend.hasNews')}</Chip>}
          </div>

          <div className="chat" ref={chatRef}>
            {s.friendMessages.length === 0 && <p className="empty">{t('friend.empty')}</p>}
            {s.friendMessages.map((m) => (
              <ChatBubble key={m.id} speaker={m.speaker}>
                {m.text}
              </ChatBubble>
            ))}
            {s.friendTyping && <div className="typing-dot" aria-label={t('friend.typing')} />}
          </div>

          <div className="chat-input">
            <input
              className="input"
              placeholder={t('friend.inputPlaceholder')}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              disabled={s.friendTyping}
            />
            <Button small onClick={send} disabled={!draft.trim() || s.friendTyping}>
              {t('friend.send')}
            </Button>
          </div>
        </Card>

        {/* 侧栏：它记得的事 + 任务入口 */}
        <div className="friend-side stack">
          <Card>
            <CardHead title={t('friend.memoriesTitle')} sub={t('friend.memoriesHint')} />
            {s.memories.length === 0 ? (
              <p className="empty">{t('profile.memoriesEmpty')}</p>
            ) : (
              <ul className="mem-list">
                {s.memories.map((m) => (
                  <li key={m.id} className="mem">
                    <p>{m.content}</p>
                    <footer>
                      <Chip tone="well">{m.source}</Chip>
                      <Chip tone={m.confidence === 'high' ? 'mint' : 'paper'}>
                        {t('profile.confidence')}：
                        {m.confidence === 'high'
                          ? t('profile.confHigh')
                          : m.confidence === 'mid'
                            ? t('profile.confMid')
                            : t('profile.confLow')}
                      </Chip>
                      <button className="mem-del" onClick={() => s.deleteMemory(m.id)}>
                        {t('profile.deleteMemory')}
                      </button>
                    </footer>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* 任务区 */}
          <Card>
            <CardHead
              title={
                s.task
                  ? `${t('friend.taskCard')} · ${
                      s.task.status === 'running'
                        ? t('task.statusRunning')
                        : s.task.status === 'done'
                          ? t('task.statusDone')
                          : t('task.statusPaused')
                    }`
                  : t('friend.taskCard')
              }
            />
            {s.task ? (
              <div className="task-mini">
                <p>
                  {t('task.goal')}：{s.task.goal} · {t('task.condition')}：{s.task.condition} ·{' '}
                  {t('task.count')}：{s.task.count} {t('report.statUnit')}
                </p>
                <p className="task-mini__done">
                  {t('task.doneWhen')}：{s.task.doneWhen}
                </p>
                <div
                  className="grow"
                  style={{ ['--g' as string]: String(s.task.progress / s.task.count) }}
                />
                <p className="task-mini__progress">
                  {t('task.progress')}：
                  {t('task.progressOf', { done: s.task.progress, total: s.task.count })}
                </p>
                {s.proxyMessages.length === 0 && (
                  <Button small variant="secondary" block onClick={s.startProxy}>
                    开始执行（demo 加速）
                  </Button>
                )}
                {s.proxyDone && (
                  <Button small block onClick={() => navigate('/chat/lin/result')}>
                    {t('proxyChat.resultLink')}
                  </Button>
                )}
              </div>
            ) : canAssignTask ? (
              <div className="task-entry">
                <p>试试跟阿澈说：「{taskText}」</p>
                <Button small variant="secondary" block onClick={() => setTaskDraftOpen(true)}>
                  生成{t('friend.taskCard')}
                </Button>
              </div>
            ) : (
              <p className="empty">
                跟阿澈多聊几句（还差 {5 - s.userReplyCount} 则），就能交办任务。
              </p>
            )}
          </Card>

          {/* 模拟下次见面 */}
          {canAssignTask && !s.reportReady && !s.task && (
            <Button small variant="secondary" block onClick={s.nextMeet}>
              {t('friend.nextMeet')}
              <em className="hint-inline">{t('friend.nextMeetHint')}</em>
            </Button>
          )}
        </div>
      </div>

      {/* 回报卡片（模拟下次见面后出现） */}
      <Modal
        open={s.reportReady}
        onClose={s.dismissReport}
        title={t('report.title')}
        sub={t('report.friendTone')}
        sheet="pear"
        footer={
          <>
            <Button variant="secondary" onClick={s.dismissReport}>
              {t('report.dismiss')}
            </Button>
            <Button onClick={openReport}>{t('report.seeResult')}</Button>
          </>
        }
      >
        <TaskReport />
      </Modal>

      {/* Agent 工作日志（dev_mode） */}
      {s.settings.devMode && <AgentLogPanel logs={s.taskLogs} />}

      {/* 任务确认卡 Modal */}
      <TaskConfirmModal
        open={taskDraftOpen}
        text={taskText}
        onText={setTaskText}
        onCancel={() => setTaskDraftOpen(false)}
        onConfirm={() => {
          s.createTask({
            goal: '运动伙伴',
            condition: '喜欢登山',
            count: 3,
            doneWhen: '找到 2 位双向合适就停',
          })
          setTaskDraftOpen(false)
          s.startProxy()
        }}
      />
    </div>
  )
}

function TaskReport() {
  const avgMin = useDemoStore((s) => s.settings.avgManualMin)
  return (
    <div className="report stack">
      <p className="report__lead">
        「你不在的时候我帮你看了一下，今天聊了 6 个人，有 2 个跟你很合。其中一个也喜欢爬山，要不要看看？」
      </p>
      <div className="stats-row">
        <div className="stat">
          <b>20</b>
          <span>{t('report.statScanned')}</span>
        </div>
        <div className="stat">
          <b>6</b>
          <span>{t('report.statChatted')}</span>
        </div>
        <div className="stat stat--mint">
          <b>2</b>
          <span>{t('report.statFit')}</span>
        </div>
      </div>
      <p className="report__calc">
        {t('report.calcNote', { sessions: 6, hours: Math.max(1, Math.round((6 * avgMin) / 60)) })}
        <em>{t('report.calcNoteAdjust')}</em>
      </p>
    </div>
  )
}

function TaskConfirmModal({
  open,
  text,
  onText,
  onCancel,
  onConfirm,
}: {
  open: boolean
  text: string
  onText: (v: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={t('task.title')}
      sub={t('task.subtitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {t('task.cancel')}
          </Button>
          <Button onClick={onConfirm}>{t('task.confirm')}</Button>
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
            <dd>运动伙伴</dd>
          </div>
          <div>
            <dt>{t('task.condition')}</dt>
            <dd>喜欢登山</dd>
          </div>
          <div>
            <dt>{t('task.count')}</dt>
            <dd>3 人</dd>
          </div>
          <div>
            <dt>{t('task.doneWhen')}</dt>
            <dd>找到 2 位双向合适就停</dd>
          </div>
        </dl>
      </div>
    </Modal>
  )
}
