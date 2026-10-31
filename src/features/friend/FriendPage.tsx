import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router'
import { ChatBubble } from '@components/ui/ChatBubble'
import { Button, Chip } from '@components/ui/Button'
import { RiveAvatar } from '@components/ui/RiveAvatar'
import { Modal } from '@components/ui/Modal'
import { useDemoStore } from '@store/useDemoStore'
import { useAutoScrollBottom } from '@hooks/useAutoScrollBottom'
import { t } from '@i18n/t'
import { AgentLogPanel } from '@components/AgentLogPanel'
import { TaskConfirmCard } from '@features/social/components/TaskConfirmCard'
import {
  isHttpMode,
  callFriendIntro,
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
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')

  // http 模式专用状态
  const [httpMessages, setHttpMessages] = useState<FriendMessage[]>([])
  const [httpTyping, setHttpTyping] = useState(false)
  const [httpError, setHttpError] = useState<string | null>(null)
  // http 模式：后端建的待确认任务 ID（显示 B 的 TaskConfirmCard）；工作日志面板开关用后端 dev_mode
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null)
  const [httpDevMode, setHttpDevMode] = useState(false)
  // nudge：最后一则消息是 AI 消息 + 用户 40s 没回复时，主动接话一次
  const [nudgeSentAfter, setNudgeSentAfter] = useState<string | null>(null) // 上次 nudge 触发时的最后 AI 消息 id

  // 消息数量用于自动滚动（mock 或 http 模式均适用）
  const msgCount = isHttpMode ? httpMessages.length : s.friendMessages.length
  const chatRef = useAutoScrollBottom<HTMLDivElement>(msgCount)

  // http 模式：挂载时拉消息 + 首次见面
  useEffect(() => {
    if (!isHttpMode) return
    const init = async () => {
      try {
        await callFriendIntro()   // 幂等，intro_done 时直接 ok
      } catch { /* 非致命 */ }
      try {
        const msgs = await getFriendMessages()
        setHttpMessages(msgs)
      } catch (e) {
        console.error('[FriendPage] loadMessages', e)
      }
      try {
        const settings = await fetchSettings()
        setHttpDevMode(settings?.dev_mode ?? false)
      } catch { /* 面板默认不显示 */ }
    }
    void init()
  }, [])

  const send = useCallback(async () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')

    if (!isHttpMode) {
      s.sendFriendMessage(text)
      return
    }

    // http 模式：乐观添加用户消息，再打 API
    const tempId = `tmp-${Date.now()}`
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

    try {
      const result = await callFriendChat(text)
      // 拉最新消息（包含 AI 回复）
      const msgs = await getFriendMessages()
      setHttpMessages(msgs)
      // task_intent：后端已建真任务（pending_confirm），显示 B 的确认卡
      if (result.taskId) {
        setPendingTaskId(result.taskId)
        // 更新侧栏任务列表
      }
    } catch (e: unknown) {
      setHttpError(e instanceof Error ? e.message : '阿澈刚刚恍神了，再说一次？')
      // 移除乐观消息
      setHttpMessages((prev) => prev.filter((m) => m.id !== tempId))
    } finally {
      setHttpTyping(false)
    }
  }, [draft, s])


  // Nudge：http 模式下，最后一则是 AI 消息 + 用户沉默 40s → 阿澈主动接话（每次沉默最多一次）
  useEffect(() => {
    if (!isHttpMode || httpMessages.length === 0) return
    const lastMsg = httpMessages[httpMessages.length - 1]
    if (!lastMsg || lastMsg.role !== 'friend') return // 最后一则是用户，不 nudge
    if (nudgeSentAfter === lastMsg.id) return // 这段沉默已经 nudge 过了
    const lastId = lastMsg.id
    const timer = setTimeout(async () => {
      setNudgeSentAfter(lastId)
      setHttpTyping(true)
      try {
        await callFriendChat('', 'nudge')
        const msgs = await getFriendMessages()
        setHttpMessages(msgs)
      } catch { /* nudge 失败静默 */ } finally {
        setHttpTyping(false)
      }
    }, 40_000) // 40 秒
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [httpMessages, nudgeSentAfter])

  const openReport = () => {
    s.dismissReport()
    navigate('/chat/lin/result')
  }


  return (
    <div className="page friend-page">
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
        </div>

        <div className="chat" ref={chatRef}>
          {isHttpMode ? (
            <>
              {httpMessages.length === 0 && !httpTyping && (
                <p className="empty">{t('friend.empty')}</p>
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
              {s.friendMessages.length === 0 && <p className="empty">{t('friend.empty')}</p>}
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
            onKeyDown={(e) => e.key === 'Enter' && void send()}
            disabled={isHttpMode ? httpTyping : s.friendTyping}
          />
          <Button
            small
            onClick={() => void send()}
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
          onClose={() => setPendingTaskId(null)}
          title={t('friend.taskCard')}
          sub="Agent 理解的任务如下，确认后开始执行"
        >
          <TaskConfirmCard
            taskId={pendingTaskId}
            onStarted={(task) => {
              setPendingTaskId(null)
              navigate(`/tasks/${task.id}`)
            }}
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
