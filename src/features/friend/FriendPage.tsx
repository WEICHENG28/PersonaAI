import { useState, useEffect, useCallback } from 'react'
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
import { TaskConfirmCard } from '@features/social/components/TaskConfirmCard'
import { useLobbyInvite } from '@features/social/components/LobbyInvite'
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

  // 消息数量用于自动滚动（mock 或 http 模式均适用）
  const msgCount = isHttpMode ? httpMessages.length : s.friendMessages.length
  // 聊夠了、對外檔案也夠完整 → 邀請一鍵加入大廳（B 的元件）
  const lobbyInvite = useLobbyInvite(httpMessages.filter((m) => m.role === 'user').length)
  const chatRef = useAutoScrollBottom<HTMLDivElement>(msgCount)

  // http 模式：挂载时拉消息 + 首次见面
  //（每次导到这页都重跑：从铃铛「阿澈有事想跟你说」点进来时，location.key 会变）
  useEffect(() => {
    if (!isHttpMode) return
    const init = async () => {
      try {
        await callFriendIntro()   // 幂等，intro_done 时直接 ok
      } catch { /* 非致命 */ }
      // 有任务回报就让阿澈先说（铃铛的通知也会变已读）；失败不影响聊天
      try {
        await deliverReports()
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
  }, [location.key])

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


  // Nudge：http 模式下，最后一则是 AI 消息 + 用户沉默 75s → 阿澈主动接话。
  // 规则：使用者每次沉默最多 1 次——判断「最后一条 user 讯息之后有没有 meta.nudge 的讯息」，
  // 有就不再设计时器（不靠本地 state，重新整理 / 多分頁也不会重复）。
  // 分頁在背景（document.visibilityState !== 'visible'）时不发。
  // 后端也有同样的防重复挡（meta.nudge 检查），双保险。
  useEffect(() => {
    if (!isHttpMode || httpMessages.length === 0) return
    const lastMsg = httpMessages[httpMessages.length - 1]
    if (!lastMsg || lastMsg.role !== 'friend') return // 最后一则是用户，不 nudge
    // 最后一条 user 讯息之后已经有过 nudge → 这段沉默已经接过话
    const lastUserIdx = httpMessages.map((m) => m.role).lastIndexOf('user')
    const afterUser = httpMessages.slice(lastUserIdx + 1)
    if (afterUser.some((m) => m.meta?.nudge === true)) return
    // 分頁在背景不发（等回到前景、effect 重跑时再计时）
    if (document.visibilityState !== 'visible') return
    const timer = setTimeout(async () => {
      if (document.visibilityState !== 'visible') return // 触发瞬间再确认一次
      setHttpTyping(true)
      try {
        await callFriendChat('', 'nudge')
        const msgs = await getFriendMessages()
        setHttpMessages(msgs)
      } catch { /* nudge 失败静默 */ } finally {
        setHttpTyping(false)
      }
    }, 75_000) // 75 秒（60–90s 范围内）
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [httpMessages])

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
          {lobbyInvite.banner}
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
