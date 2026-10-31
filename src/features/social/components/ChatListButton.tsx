// 頂欄「我的聊天」：鈴鐺旁的聊天按鈕，點開列出還沒結束的對話（等我接手、本人在聊、分身代聊中），點一下回到聊天室。
// 只在 http 模式顯示（mock 模式沒有真的對話）。面板樣式沿用 C 的通知鈴鐺。擁有者：B。
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { ChatIcon } from '@components/ui/Icons'
import { Chip } from '@components/ui/Button'
import { PersonKindChip } from '@components/PersonKindChip'
import { isLiveChat } from '@lib/api/twin'
import { listChats, type ChatListItem, type ChatState } from '@lib/api/social'
import { panelPlacement, timeLabel } from '@features/twin/components/notificationView'
import '@features/twin/components/notificationBell.css'
import { playNotifySound, shouldChime } from '@lib/notifySound'

const STATE_LABEL: Record<ChatState, { text: string; tone: 'coral' | 'mint' | 'ink' }> = {
  waiting_you: { text: '等你接手', tone: 'coral' },
  chatting: { text: '聊天室', tone: 'mint' },
  twin_chatting: { text: '分身代聊中', tone: 'ink' },
}

const REFRESH_MS = 30_000

export function ChatListButton() {
  if (!isLiveChat) return null
  return <LiveChatListButton />
}

function LiveChatListButton() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<ChatListItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const waiting = items.filter((i) => i.state === 'waiting_you').length

  // 多了一個「等你接手」也叮咚一聲
  const lastWaiting = useRef<number | null>(null)
  useEffect(() => {
    if (shouldChime(lastWaiting.current, waiting)) playNotifySound()
    lastWaiting.current = waiting
  }, [waiting])

  const load = async () => {
    try {
      setItems(await listChats())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '聊天列表暂时读不到')
    }
  }

  // 定期更新，角標才看得到新的「等你接手」
  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), REFRESH_MS)
    return () => window.clearInterval(id)
  }, [])

  // 點按鈕和面板以外的地方、或按 Esc 關閉
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
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
          if (!open) void load()
          setOpen(!open)
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="我的聊天"
        aria-label="我的聊天"
      >
        <ChatIcon size={18} />
        {waiting > 0 && <span className="notif-count">{waiting}</span>}
      </button>
      {open && <ChatPanel items={items} error={error} anchor={buttonRef.current} panelRef={panelRef} onClose={() => setOpen(false)} />}
    </div>
  )
}

function ChatPanel({
  items,
  error,
  anchor,
  panelRef,
  onClose,
}: {
  items: ChatListItem[]
  error: string | null
  anchor: HTMLElement | null
  panelRef: React.RefObject<HTMLDivElement | null>
  onClose(): void
}) {
  const navigate = useNavigate()
  const [style, setStyle] = useState<CSSProperties | null>(null)
  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor?.getBoundingClientRect()
      if (rect) setStyle(panelPlacement(rect, window.innerWidth))
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchor])
  if (!style) return null

  // 頂欄有 clip-path，面板放 body 才不會被裁掉（和通知鈴鐺一樣）
  return createPortal(
    <div ref={panelRef} className="card notif-bell__panel" role="dialog" aria-label="我的聊天" style={style}>
      <h2 className="notif-bell__title">我的聊天</h2>
      {error && (
        <p className="notif-bell__note" role="status">
          {error}
        </p>
      )}
      {items.length === 0 && !error && <p className="empty">还没有进行中的聊天。让社交 Agent 去找人，或在大厅挑一位聊聊。</p>}
      <ul className="notif-bell__list">
        {items.map((item) => (
          <li key={item.conversationId}>
            <button
              type="button"
              className="notif-item"
              style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, cursor: 'pointer', padding: 'var(--space-xs) 0' }}
              onClick={() => {
                onClose()
                navigate(`/chat/${item.conversationId}`)
              }}
            >
              {/* 名字（大一點）和真人／示范用户同一行，狀態在右邊 */}
              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 'var(--text-lg)' }}>{item.otherName}</strong>
                <PersonKindChip isSeed={item.otherIsSeed} />
                <span style={{ marginLeft: 'auto' }}>
                  <Chip tone={STATE_LABEL[item.state].tone}>{STATE_LABEL[item.state].text}</Chip>
                </span>
              </span>
              {item.lastMessage && <p className="hint-inline">{item.lastMessage}</p>}
              <p className="hint-inline">{timeLabel(item.lastAt)}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>,
    document.body,
  )
}
