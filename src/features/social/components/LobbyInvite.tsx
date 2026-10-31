import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Modal } from '@components/ui/Modal'
import { Button, Chip } from '@components/ui/Button'
import { useDemoStore } from '@store/useDemoStore'
import { isHttpMode } from '@lib/api/friend'
import { acceptLobbyInvite, getLobbyInvite, type LobbyShareable } from '@lib/api/social'

/** 和後端 CONFIG.LOBBY_INVITE_MIN_MESSAGES 一致：說滿這麼多句才去問後端，省得每句都打 API。 */
const MIN_MESSAGES = 8

function dismissKey(userId: string) {
  return `personaai:lobbyInviteDismissed:${userId}`
}

function readDismissed(userId: string): boolean {
  try {
    return localStorage.getItem(dismissKey(userId)) === '1'
  } catch {
    return false
  }
}

/**
 * 真人進大廳的邀請（http 模式）：和阿澈聊夠了、對外檔案也夠完整，就跳出卡片，
 * 讓用戶看過自己的對外檔案後一鍵加入大廳（確認檔案＋開啟社交 Agent）。按「先不要」這個瀏覽器就不再問。
 * 用法：const lobbyInvite = useLobbyInvite(用戶說了幾句)；畫面放 {lobbyInvite}。
 */
export function useLobbyInvite(userMessageCount: number): ReactNode {
  const user = useDemoStore((s) => s.user)
  const pushNotification = useDemoStore((s) => s.pushNotification)
  const navigate = useNavigate()
  const [shareable, setShareable] = useState<LobbyShareable | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!isHttpMode || !user || done || shareable || userMessageCount < MIN_MESSAGES) return
    if (readDismissed(user.id)) return
    let alive = true
    getLobbyInvite()
      .then((view) => {
        if (!alive) return
        if (view.status === 'invite') setShareable(view.shareable)
        if (view.status === 'in_lobby') setDone(true)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [user, userMessageCount, done, shareable])

  if (!shareable || !user) return null

  const later = () => {
    try {
      localStorage.setItem(dismissKey(user.id), '1')
    } catch {
      /* 存不了就下次再問 */
    }
    setShareable(null)
    setDone(true)
    pushNotification({ title: '好的，先不进大厅', body: '想加入时，到「我的档案」确认、再到设置开启社交 Agent 就可以', ttlMs: 8_000 })
  }

  const join = async () => {
    setBusy(true)
    setError(null)
    try {
      const view = await acceptLobbyInvite()
      if (view.status !== 'in_lobby') throw new Error(view.status === 'not_yet' ? view.reason : '加入失败')
      setShareable(null)
      setDone(true)
      pushNotification({
        title: '你已经在大厅了',
        body: '别人能看到你的对外档案，社交 Agent 也能帮你找人。点这里去大厅看看',
        link: '/lobby',
        ttlMs: 10_000,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : '加入失败，请稍后再试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open demo={false} onClose={later} title="你可以进大厅了" sub="和阿澈聊了这么多，你的对外档案已经准备好">
      <div className="stack">
        <div className="card stack">
          <p>
            <strong>{shareable.intro}</strong>
          </p>
          <div>
            {shareable.interests.map((i) => (
              <Chip key={i} tone="mint">
                {i}
              </Chip>
            ))}
          </div>
          {shareable.looking_for && <p>想找：{shareable.looking_for}</p>}
        </div>
        <ul className="suggest-list">
          <li>加入后，别人在大厅能看到这张卡片（只有这些内容，不会给出聊天记录）。</li>
          <li>你的社交 Agent 可以帮你找人，别人的 Agent 也可能来找你的分身聊。</li>
          <li>大厅里有真人，也有示范用户。随时可以在设置关闭。</li>
        </ul>
        {error && (
          <p className="chip chip--coral" role="alert">
            {error}
          </p>
        )}
        <div className="next-actions">
          <Button variant="secondary" disabled={busy} onClick={later}>
            先不要
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => navigate('/profile')}>
            先改改档案
          </Button>
          <Button disabled={busy} onClick={() => void join()}>
            {busy ? '加入中…' : '加入大厅'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
