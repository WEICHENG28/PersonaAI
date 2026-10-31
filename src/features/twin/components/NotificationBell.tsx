// C7 通知铃铛（docs/07C C7）：放在 A 的顶栏 NavBar 右端，由 A 挂上。拥有者：C。
// 订阅自己的 notifications，依类型显示：match → 结果页；request_human → 现在聊／稍后聊／拒绝；
// anomaly（C8）→ 对方的具体行为＋继续聊／结束对话／检举；friend_report → /friend。mock 模式不显示（demo 通知仍由 AppShell 的吐司显示）。
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { Button, Chip } from '@components/ui/Button'
import { isLiveChat, type AnomalyChoice, type HumanResponse, type NotificationView } from '@lib/api/twin'
import {
  isPendingAnomaly,
  isPendingRequest,
  notificationLink,
  notificationTitle,
  NOTIFY_TEXT,
  panelPlacement,
  timeLabel,
  unreadCount,
} from './notificationView'
import { useNotifications, type NotificationsState } from './useNotifications'
import { BellIcon } from '@components/ui/Icons'
import './notificationBell.css'

export function NotificationBell() {
  if (!isLiveChat) return null
  return <LiveNotificationBell />
}

function LiveNotificationBell() {
  const state = useNotifications(true)
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const unread = unreadCount(state.list)

  // 点铃铛和面板以外的地方、或按 Esc 关闭（面板在 portal 里，不在铃铛的 DOM 底下，要两个都排除）
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="notif-bell">
      <button
        ref={buttonRef}
        className={`knob ${open ? 'is-on' : ''}`}
        onClick={() => {
          if (!open) void state.reload()
          setOpen(!open)
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={NOTIFY_TEXT.bell}
        aria-label={NOTIFY_TEXT.bell}
      >
        <BellIcon size={18} />
        {unread > 0 && <span className="notif-count">{unread}</span>}
      </button>
      {open && <NotificationPanel state={state} anchorRef={buttonRef} panelRef={panelRef} onClose={() => setOpen(false)} />}
    </div>
  )
}

/** 面板贴在铃铛下方、右缘对齐，并且不超出视窗；视窗大小改变时重算。 */
function usePanelStyle(anchorRef: RefObject<HTMLElement | null>): CSSProperties | null {
  const [style, setStyle] = useState<CSSProperties | null>(null)
  useLayoutEffect(() => {
    const place = () => {
      const rect = anchorRef.current?.getBoundingClientRect()
      if (rect) setStyle(panelPlacement(rect, window.innerWidth))
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchorRef])
  return style
}

interface NotificationPanelProps {
  state: NotificationsState
  anchorRef: RefObject<HTMLElement | null>
  panelRef: RefObject<HTMLDivElement | null>
  onClose(): void
}

/** 顶栏有 clip-path（撕纸下缘），放在里面的面板会被裁掉，所以用 portal 挂到 body、position: fixed。 */
function NotificationPanel({ state, anchorRef, panelRef, onClose }: NotificationPanelProps) {
  const style = usePanelStyle(anchorRef)
  if (!style) return null
  return createPortal(
    <div ref={panelRef} className="card notif-bell__panel" role="dialog" aria-label={NOTIFY_TEXT.title} style={style}>
      <h2 className="notif-bell__title">{NOTIFY_TEXT.title}</h2>
      {state.loadError && <p className="notif-bell__note" role="status">{state.loadError}</p>}
      {state.list.length === 0 && !state.loadError && <p className="empty">{NOTIFY_TEXT.empty}</p>}
      <ul className="notif-bell__list">
        {state.list.map((n) => (
          <NotificationItem key={n.id} n={n} state={state} onClose={onClose} />
        ))}
      </ul>
    </div>,
    document.body,
  )
}

interface NotificationItemProps {
  n: NotificationView
  state: NotificationsState
  onClose(): void
}

function NotificationItem({ n, state, onClose }: NotificationItemProps) {
  const navigate = useNavigate()
  const link = notificationLink(n)
  const [pending, setPending] = useState<HumanResponse | null>(null)
  const busy = state.busyId === n.id
  const error = state.errors[n.id]

  const go = (to: string, routeState?: unknown) => {
    onClose()
    navigate(to, routeState ? { state: routeState } : undefined)
  }
  const open = () => {
    if (!link) return
    if (n.type === 'match') void state.markRead(n)
    go(link)
  }
  const respond = async (response: HumanResponse) => {
    setPending(response)
    const view = await state.respond(n, response)
    setPending(null)
    // 现在聊：到聊天室，先显示接手卡片（LiveChatRoom 读路由 state，C6）
    if (view?.response === 'now') go(`/chat/${encodeURIComponent(view.conversationId)}`, view.handoff ? { handoff: view.handoff } : undefined)
  }

  return (
    <li className={`notif-item ${n.read ? 'is-read' : ''}`}>
      <div className="notif-item__head">
        <strong className="notif-item__title">{notificationTitle(n)}</strong>
        <span className="notif-item__time">{timeLabel(n.createdAt)}</span>
      </div>
      {n.type === 'match' && n.mutual && <Chip tone="mint">{NOTIFY_TEXT.mutual}</Chip>}

      {isPendingRequest(n) ? (
        <div className="notif-item__actions">
          {(['now', 'later', 'decline'] as const).map((r) => (
            <Button key={r} small variant={r === 'now' ? 'primary' : 'secondary'} disabled={busy} onClick={() => void respond(r)}>
              {NOTIFY_TEXT.respond[r]}
            </Button>
          ))}
        </div>
      ) : (
        // 處理中不顯示結果：後端先記下回應再收尾／接手，Realtime 重讀會比動作完成早好幾秒
        n.response && !busy && <p className="notif-bell__note">{NOTIFY_TEXT.responded[n.response]}</p>
      )}
      {busy && <p className="notif-bell__note" role="status">{pending === 'now' ? NOTIFY_TEXT.takingOver : NOTIFY_TEXT.responding}</p>}
      {error && <p className="notif-bell__note" role="alert">{error}</p>}

      {n.type === 'anomaly' && <AnomalyDetail n={n} state={state} busy={busy} />}
      {link && (
        <div className="notif-item__actions">
          <Button small variant="secondary" onClick={open}>
            {linkLabel(n)}
          </Button>
        </div>
      )}
    </li>
  )
}

interface AnomalyDetailProps {
  n: NotificationView
  state: NotificationsState
  busy: boolean
}

/** C8：对方的具体行为（只有你看得到）＋继续聊／结束对话／检举；选过就显示选了什么。 */
function AnomalyDetail({ n, state, busy }: AnomalyDetailProps) {
  return (
    <>
      {n.evidence.length > 0 && (
        <div className="notif-item__evidence">
          <span className="notif-bell__note">{NOTIFY_TEXT.anomalyEvidence}</span>
          <ul>
            {n.evidence.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="notif-bell__note">{NOTIFY_TEXT.anomalyNote}</p>
      {isPendingAnomaly(n) ? (
        <div className="notif-item__actions">
          {(['continue', 'end', 'report'] as const satisfies readonly AnomalyChoice[]).map((c) => (
            <Button key={c} small variant={c === 'end' ? 'danger' : 'secondary'} disabled={busy} onClick={() => void state.choose(n, c)}>
              {NOTIFY_TEXT.choose[c]}
            </Button>
          ))}
        </div>
      ) : (
        n.choice && !busy && <p className="notif-bell__note">{NOTIFY_TEXT.chosen[n.choice]}</p>
      )}
    </>
  )
}

function linkLabel(n: NotificationView): string {
  if (n.type === 'match') return NOTIFY_TEXT.viewResult
  if (n.type === 'friend_report') return NOTIFY_TEXT.goFriend
  return NOTIFY_TEXT.goChat
}
