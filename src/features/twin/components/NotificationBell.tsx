// C7 通知铃铛（docs/07C C7）：放在 A 的顶栏 NavBar 右端，由 A 挂上。拥有者：C。
// 订阅自己的 notifications，依类型显示：match → 结果页；request_human → 现在聊／稍后聊／拒绝；
// anomaly → 文字（动作是 C8）；friend_report → /friend。mock 模式不显示（demo 通知仍由 AppShell 的吐司显示）。
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, Chip } from '@components/ui/Button'
import { isLiveChat, type HumanResponse, type NotificationView } from '@lib/api/twin'
import {
  isPendingRequest,
  notificationLink,
  notificationTitle,
  NOTIFY_TEXT,
  timeLabel,
  unreadCount,
} from './notificationView'
import { useNotifications, type NotificationsState } from './useNotifications'
import './notificationBell.css'

export function NotificationBell() {
  if (!isLiveChat) return null
  return <LiveNotificationBell />
}

function LiveNotificationBell() {
  const state = useNotifications(true)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const unread = unreadCount(state.list)

  // 点外面或按 Esc 关闭
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
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
    <div className="notif-bell" ref={rootRef}>
      <button
        className={`knob ${open ? 'is-on' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={NOTIFY_TEXT.bell}
      >
        <span className="knob__meta">{NOTIFY_TEXT.bell}</span>
        {unread > 0 && <span className="notif-count">{unread}</span>}
      </button>
      {open && <NotificationPanel state={state} onClose={() => setOpen(false)} />}
    </div>
  )
}

interface NotificationPanelProps {
  state: NotificationsState
  onClose(): void
}

function NotificationPanel({ state, onClose }: NotificationPanelProps) {
  return (
    <div className="card notif-bell__panel" role="dialog" aria-label={NOTIFY_TEXT.title}>
      <h2 className="notif-bell__title">{NOTIFY_TEXT.title}</h2>
      {state.loadError && <p className="notif-bell__note" role="status">{state.loadError}</p>}
      {state.list.length === 0 && !state.loadError && <p className="empty">{NOTIFY_TEXT.empty}</p>}
      <ul className="notif-bell__list">
        {state.list.map((n) => (
          <NotificationItem key={n.id} n={n} state={state} onClose={onClose} />
        ))}
      </ul>
    </div>
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
        n.response && <p className="notif-bell__note">{NOTIFY_TEXT.responded[n.response]}</p>
      )}
      {busy && <p className="notif-bell__note" role="status">{pending === 'now' ? NOTIFY_TEXT.takingOver : NOTIFY_TEXT.responding}</p>}
      {error && <p className="notif-bell__note" role="alert">{error}</p>}

      {n.type === 'anomaly' && (
        <div className="notif-item__actions">
          {NOTIFY_TEXT.anomalyActions.map((a) => (
            <Button key={a} small variant="secondary" disabled title={NOTIFY_TEXT.comingSoon}>
              {a}
            </Button>
          ))}
        </div>
      )}
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

function linkLabel(n: NotificationView): string {
  if (n.type === 'match') return NOTIFY_TEXT.viewResult
  if (n.type === 'friend_report') return NOTIFY_TEXT.goFriend
  return NOTIFY_TEXT.goChat
}
