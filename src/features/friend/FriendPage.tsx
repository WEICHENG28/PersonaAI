import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ChatBubble } from '@components/ui/ChatBubble'
import { Button, Chip } from '@components/ui/Button'
import { RiveAvatar } from '@components/ui/RiveAvatar'
import { Modal } from '@components/ui/Modal'
import { useDemoStore } from '@store/useDemoStore'
import { usePrivacyCheck } from '@components/PrivacyWarning'
import { useAutoScrollBottom } from '@hooks/useAutoScrollBottom'
import { t } from '@i18n/t'
import { AgentLogPanel } from '@components/AgentLogPanel'
import { LoadingDots } from '@components/ui/LoadingDots'
import { TaskConfirmCard } from '@features/social/components/TaskConfirmCard'
import { useLobbyInvite } from '@features/social/components/LobbyInvite'
import { useOnboardingGuide } from '@features/social/components/OnboardingGuide'
import { shouldScheduleNudge } from './chatFailure'
import { applyChatResult, mergeInitializedHistory, sendChatTurn } from './chatState'
import { initializeFriendPage } from './chatInitialization'
import {
  isHttpMode,
  callFriendIntro,
  deliverReports,
  callFriendChat,
  getFriendMessages,
  fetchSettings,
  type FriendMessage,
} from '@lib/api/friend'

/** 画面 2-4：AI 朋友聊天 + 记忆侧栏 + 任务确认 + 回报
 *  http 模式：消息来自 GET /api/friend/messages；发送走 POST /api/friend/chat；
 *  task_intent 时显示 B 的 <TaskConfirmCard>（真任务，确认后导向 /tasks/<id>）。
 *  mock 模式：demo store 驱动（不打 API，TaskConfirmModal demo 流程）。
 */
export function FriendPage() {
  const s = useDemoStore()
  // 送出前檢查隱私（微信號、手機號等），有就先跳警告
  const privacy = usePrivacyCheck('friend')
  const navigate = useNavigate()
  const location = useLocation()
  const [draft, setDraft] = useState('')

  // http 模式专用状态
  const [httpMessages, setHttpMessages] = useState<FriendMessage[]>([])
  const [httpTyping, setHttpTyping] = useState(false)
  const [httpError, setHttpError] = useState<string | null>(null)
  // http 模式：后端建的待确认任务 ID（显示 B 的 TaskConfirmCard）；工作日志面板开关用后端 dev_mode
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null)
  const [httpDevMode, setHttpDevMode] = useState(false)
  const [messagesLoaded, setMessagesLoaded] = useState(false)
  const sendSeq = useRef(0)
  const sendInFlight = useRef(false)
  const unconfirmedSend = useRef(false)

  // 消息数量用于自动滚动（mock 或 http 模式均适用）
  const msgCount = isHttpMode ? httpMessages.length : s.friendMessages.length
  // 聊夠了、對外檔案也夠完整 → 邀請一鍵加入大廳（B 的元件）
  const userMessageCount = messagesLoaded ? httpMessages.filter((m) => m.role === 'user').length : null
  const lobbyInvite = useLobbyInvite(userMessageCount)
  // 新手任务第 4 步建好任务后，用同一张任务确认卡确认
  const guide = useOnboardingGuide(userMessageCount, (taskId) => setPendingTaskId(taskId))
  const chatRef = useAutoScrollBottom<HTMLDivElement>(msgCount)

  // http 模式：挂载时拉消息 + 首次见面
  //（每次导到这页都重跑：从铃铛「阿澈有事想跟你说」点进来时，location.key 会变）
  useEffect(() => {
    if (!isHttpMode) return
    let active = true
    setMessagesLoaded(false)
    void initializeFriendPage({
      callFriendIntro, deliverReports, getFriendMessages, fetchSettings,
      readSendSeq: () => sendSeq.current,
      isSending: () => sendInFlight.current,
      hasUnconfirmedSend: () => unconfirmedSend.current,
      isActive: () => active,
      onMessages: (msgs) => { setHttpMessages(msgs); setMessagesLoaded(true) },
      onStaleMessages: msgs => { setHttpMessages(prev => mergeInitializedHistory(prev, msgs)); setMessagesLoaded(true) },
      onSettings: (settings) => setHttpDevMode(settings?.dev_mode ?? false),
      onMessagesError: (error) => console.error('[FriendPage] loadMessages', error),
    })
    return () => { active = false }
  }, [location.key])

  const send = useCallback(async () => {
    const text = draft.trim()
    if (!text) return
    const seq = ++sendSeq.current
    setDraft('')

    if (!isHttpMode) {
      s.sendFriendMessage(text)
      return
    }

    // http 模式：乐观添加用户消息，再打 API
    sendInFlight.current = true
    unconfirmedSend.current = true
    const tempId = `tmp-${seq}-${Date.now()}`
    setHttpMessages((prev) => [
      ...prev,
      {
        id: tempId,
        role: 'user' as const,
        kind: 'chat',
        content: text,
        meta: {},
        created_at: new Date().toISOString(),
      },
    ])
    setHttpTyping(true)
    setHttpError(null)

    await sendChatTurn(text, tempId, seq, {
      readSendSeq: () => sendSeq.current, callFriendChat, getFriendMessages, setMessages: setHttpMessages,
      onConfirmed: () => { unconfirmedSend.current = false; setMessagesLoaded(true) },
      onTask: setPendingTaskId,
      onError: error => setHttpError(error instanceof Error ? error.message : '阿澈刚刚恍神了，再说一次？'),
      onSettled: () => { sendInFlight.current = false; setHttpTyping(false) },
    })
  }, [draft, s])


  // Nudge：http 模式下，最后一则是 AI 消息 + 用户沉默 75s → 阿澈主动接话。
  // 规则：使用者每次沉默最多 1 次——判断「最后一条 user 讯息之后有没有 meta.nudge 的讯息」，
  // 有就不再设计时器（不靠本地 state，重新整理 / 多分頁也不会重复）。
  // 分頁在背景（document.visibilityState !== 'visible'）时不发。
  // 后端也有同样的防重复挡（meta.nudge 检查），双保险。
  useEffect(() => {
    if (!isHttpMode || !shouldScheduleNudge({ messages: httpMessages, httpError })) return
    // 分頁在背景不发（等回到前景、effect 重跑时再计时）
    if (document.visibilityState !== 'visible') return
    const timer = setTimeout(async () => {
      if (document.visibilityState !== 'visible') return // 触发瞬间再确认一次
      if (sendInFlight.current || unconfirmedSend.current) return
      const seq = ++sendSeq.current
      sendInFlight.current = true
      setHttpTyping(true)
      try {
        const result = await callFriendChat('', 'nudge')
        if (seq !== sendSeq.current) return
        if (result.messages) setHttpMessages(prev => seq === sendSeq.current ? applyChatResult(prev, '', result) ?? prev : prev)
        else {
          const msgs = await getFriendMessages()
          if (seq === sendSeq.current) setHttpMessages(prev => seq === sendSeq.current ? msgs : prev)
        }
      } catch { /* nudge 失败静默 */ } finally {
        if (seq === sendSeq.current) { sendInFlight.current = false; setHttpTyping(false) }
      }
    }, 75_000) // 75 秒（60–90s 范围内）
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [httpMessages, httpError])

  // 任務卡先關掉（再想想／點旁邊）：任務留著等確認，用通知告訴用戶去哪裡找
  const taskLater = (taskId: string) => {
    setPendingTaskId(null)
    s.pushNotification({
      title: '任务先帮你留着',
      body: '还没开始找人。想好了到「我的任务」按确认就会开始，点这里去看看',
      link: `/tasks/${taskId}`,
      ttlMs: 10_000,
    })
  }

  const openReport = () => {
    s.dismissReport()
    navigate('/chat/lin/result')
  }


  return (
    <div className="page friend-page">
      {privacy.dialog}
      {lobbyInvite.dialog}
      {/* 桌机左栏：chromabot 大头像（手机隐藏；占屏幕高度 60%） */}
      <aside className="friend-avatar-col" aria-hidden>
        <RiveAvatar name="chromabot" fill className="friend-avatar-rive" />
      </aside>

      {/* 聊天栏（无容器，直接融入页面；输入框固定底部） */}
      <div className="friend-chat-col">
        <div className="friend-chat-head">
          {(isHttpMode ? httpTyping : s.friendTyping) && (
            <span className="typing-label">{t('friend.typing')}</span>
          )}
          {s.reportReady && <Chip tone="pear">{t('friend.hasNews')}</Chip>}
          {/* 新手任务进行中就不另外显示进大厅进度（新手任务已经包含） */}
          {!guide.active && lobbyInvite.banner}
        </div>

        {/* 新手任务：聊天 → 档案 → 进大厅 → 第一个任务 → 第一份结果（B 的元件） */}
        {guide.node}

        <div className="chat" ref={chatRef}>
          {isHttpMode ? (
            <>
              {httpMessages.length === 0 && !httpTyping && (
                <LoadingDots label={t('friend.loading')} />
              )}
              {httpMessages.map((m) => (
                <ChatBubble key={m.id} speaker={m.role === 'user' ? 'human' : 'friend'}>
                  {m.content}
                </ChatBubble>
              ))}
              {httpTyping && <div className="typing-dot" aria-label={t('friend.typing')} />}
              {httpError && (
                <p style={{ color: 'var(--c-err)', fontSize: '0.85em', padding: '0.5rem 0' }}>
                  {httpError}
                </p>
              )}
            </>
          ) : (
            <>
              {s.friendMessages.length === 0 && !s.friendTyping && (
                <LoadingDots label={t('friend.loading')} />
              )}
              {s.friendMessages.map((m) => (
                <ChatBubble key={m.id} speaker={m.speaker}>
                  {m.text}
                </ChatBubble>
              ))}
              {s.friendTyping && <div className="typing-dot" aria-label={t('friend.typing')} />}
            </>
          )}
        </div>

        {/* 输入区：有圆角 card 包裹，固定在聊天列底部 */}
        <div className="friend-input-bar card">
          <input
            className="input"
            placeholder={t('friend.inputPlaceholder')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && privacy.guard(draft, () => void send())}
            disabled={isHttpMode ? httpTyping : s.friendTyping}
          />
          <Button
            small
            onClick={() => privacy.guard(draft, () => void send())}
            disabled={!draft.trim() || (isHttpMode ? httpTyping : s.friendTyping)}
          >
            {t('friend.send')}
          </Button>
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

      {/* Agent 工作日志（http 用后端 dev_mode；mock 用 demo store 的 devMode） */}
      {(isHttpMode ? httpDevMode : s.settings.devMode) && <AgentLogPanel logs={s.taskLogs} />}

      {/* http 模式：B 的真任务确认卡（确认后导向 /tasks/<id>） */}
      {isHttpMode && pendingTaskId && (
        <Modal
          open
          demo={false}
          onClose={() => taskLater(pendingTaskId)}
          title={t('friend.taskCard')}
          sub="Agent 理解的任务如下，确认后开始执行"
        >
          <TaskConfirmCard
            taskId={pendingTaskId}
            onStarted={(task) => {
              setPendingTaskId(null)
              s.pushNotification({
                title: '已开始找人',
                body: '进度和结果都在「我的任务」，有合适的人阿澈会告诉你。点这里去看看',
                link: `/tasks/${task.id}`,
                ttlMs: 10_000,
              })
            }}
            onLater={(task) => taskLater(task.id)}
            onCancelled={() => setPendingTaskId(null)}
          />
        </Modal>
      )}
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
