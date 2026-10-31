import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ChatBubble } from '@components/ui/ChatBubble'
import { Button, Chip } from '@components/ui/Button'
import { Card } from '@components/ui/Card'
import { RiveAvatar } from '@components/ui/RiveAvatar'
import { Modal } from '@components/ui/Modal'
import { useDemoStore } from '@store/useDemoStore'
import { useAutoScrollBottom } from '@hooks/useAutoScrollBottom'
import { t } from '@i18n/t'
import { AgentLogPanel } from '@components/AgentLogPanel'
import { TaskConfirmCard } from '@features/social/components/TaskConfirmCard'
import { isHttpMode } from '@lib/api/friend'
import { FriendSidebar } from './FriendSidebar'
import { TaskConfirmModal } from './TaskConfirmModal'
import { TaskReport } from './TaskReport'
import { useHttpFriendChat } from './useHttpFriendChat'

interface Bubble {
  id: string
  speaker: 'human' | 'friend'
  text: string
}

/** 画面 2-4：AI 朋友聊天 + 记忆侧栏 + 任务确认 + 回报
 *  http 模式：消息来自 GET /api/friend/messages；发送走 POST /api/friend/chat；
 *  task_intent 时显示 B 的 <TaskConfirmCard>（真任务，确认后导向 /tasks/<id>）。
 *  mock 模式：demo store 驱动（不打 API，TaskConfirmModal demo 流程）。
 */
export function FriendPage() {
  const s = useDemoStore()
  const http = useHttpFriendChat()
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')
  const [taskDraftOpen, setTaskDraftOpen] = useState(false)
  const [taskText, setTaskText] = useState('帮我找 3 个喜欢登山的人聊聊')

  // mock：进入朋友页、还没有讯息时阿澈先打招呼（UX #5）
  const { friendIntro } = s
  useEffect(() => {
    if (!isHttpMode) friendIntro()
  }, [friendIntro])

  const bubbles: Bubble[] = isHttpMode
    ? http.messages.map((m) => ({ id: m.id, speaker: m.role === 'user' ? 'human' : 'friend', text: m.content }))
    : s.friendMessages.map((m) => ({ id: m.id, speaker: m.speaker === 'human' ? 'human' : 'friend', text: m.text }))
  const typing = isHttpMode ? http.typing : s.friendTyping
  const userCount = isHttpMode ? http.messages.filter((m) => m.role === 'user').length : s.userReplyCount
  const chatRef = useAutoScrollBottom<HTMLDivElement>(bubbles.length)

  // UX #7：mock 只在代聊结束、还没看过回报时出现；http 要有任务代聊过
  const showNextMeet = isHttpMode ? http.hasTaskRun : s.proxyDone && !s.reportSeen && !s.reportReady

  const send = () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    if (isHttpMode) void http.send(text)
    else s.sendFriendMessage(text)
  }

  const openReport = () => {
    s.dismissReport()
    navigate('/chat/lin/result')
  }

  return (
    <div className="page">
      <div className="friend-layout">
        {/* 聊天主栏（页标题拿掉，只留聊天头，UX #28） */}
        <Card className="friend-chat">
          <div className="friend-chat__head">
            <RiveAvatar name="robot" size={44} />
            <div>
              <h1 className="friend-chat__title">{t('friend.title')}</h1>
              <span>{typing ? t('friend.typing') : t('friend.subtitle')}</span>
            </div>
            {!isHttpMode && s.reportReady ? <Chip tone="pear">{t('friend.hasNews')}</Chip> : !isHttpMode && <Chip tone="well">{t('friend.demoTag')}</Chip>}
          </div>

          <div className="chat" ref={chatRef}>
            {bubbles.length === 0 && !typing && <p className="empty">{t('friend.empty')}</p>}
            {bubbles.map((m) => (
              <ChatBubble key={m.id} speaker={m.speaker}>
                {m.text}
              </ChatBubble>
            ))}
            {typing && <div className="typing-dot" aria-label={t('friend.typing')} />}
            {isHttpMode && http.error && <p className="login-error" role="alert">{http.error}</p>}
          </div>

          <div className="chat-input">
            <input
              className="input"
              placeholder={t('friend.inputPlaceholder')}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && send()}
              disabled={typing}
            />
            <Button small onClick={send} disabled={!draft.trim() || typing}>
              {t('friend.send')}
            </Button>
          </div>
        </Card>

        <FriendSidebar
          userCount={userCount}
          taskText={taskText}
          onOpenTaskDraft={() => setTaskDraftOpen(true)}
          showNextMeet={showNextMeet}
          nextMeetLoading={isHttpMode && http.nextMeetLoading}
          onNextMeet={() => (isHttpMode ? void http.nextMeet() : s.nextMeet())}
        />
      </div>

      {/* 回报卡片（mock：代聊结束后「模拟下次见面」才出现） */}
      {!isHttpMode && (
        <Modal
          open={s.reportReady}
          onClose={s.dismissReport}
          title={t('report.title')}
          sub={t('report.friendTone')}
          sheet="pear"
          demo
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
      )}

      {/* Agent 工作日志（http 用后端 dev_mode；mock 用 demo store 的 devMode） */}
      {(isHttpMode ? http.devMode : s.settings.devMode) && <AgentLogPanel logs={s.taskLogs} />}

      {/* http 模式：B 的真任务确认卡（确认后导向 /tasks/<id>） */}
      {isHttpMode && http.pendingTaskId && (
        <Modal open onClose={http.clearPendingTask} title={t('friend.taskCard')} sub="Agent 理解的任务如下，确认后开始执行">
          <TaskConfirmCard
            taskId={http.pendingTaskId}
            onStarted={(task) => {
              http.clearPendingTask()
              navigate(`/tasks/${task.id}`)
            }}
            onCancelled={http.clearPendingTask}
          />
        </Modal>
      )}

      {/* mock 模式：demo 任务确认卡（确认时就自动开始代聊） */}
      {!isHttpMode && (
        <TaskConfirmModal
          open={taskDraftOpen}
          text={taskText}
          onText={setTaskText}
          onCancel={() => setTaskDraftOpen(false)}
          onConfirm={(parsed) => {
            s.createTask(parsed)
            setTaskDraftOpen(false)
            s.startProxy()
          }}
        />
      )}
    </div>
  )
}
