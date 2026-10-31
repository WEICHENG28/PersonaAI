import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Modal } from '@components/ui/Modal'
import { Button, Chip } from '@components/ui/Button'
import { useDemoStore } from '@store/useDemoStore'
import { isHttpMode } from '@lib/api/friend'
import { acceptLobbyInvite, getLobbyInvite, type LobbyInviteView, type LobbyShareable } from '@lib/api/social'
import { lobbyProgress } from '../lobbyProgress'


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
 * 還沒達到條件時給一條進度（banner），告訴用戶還差什麼。
 * 用法：const lobby = useLobbyInvite(用戶說了幾句)；畫面放 {lobby.dialog}、{lobby.banner}。
 */
export function useLobbyInvite(userMessageCount: number): { dialog: ReactNode; banner: ReactNode } {
  const user = useDemoStore((s) => s.user)
  const pushNotification = useDemoStore((s) => s.pushNotification)
  const navigate = useNavigate()
  const [shareable, setShareable] = useState<LobbyShareable | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [notYet, setNotYet] = useState<Extract<LobbyInviteView, { status: 'not_yet' }> | null>(null)

  // 每多說一句就問一次後端（進度要跟著動）
  useEffect(() => {
    if (!isHttpMode || !user || done || shareable) return
    if (readDismissed(user.id)) return
    let alive = true
    getLobbyInvite()
      .then((view) => {
        if (!alive) return
        setNotYet(view.status === 'not_yet' ? view : null)
        if (view.status === 'invite') setShareable(view.shareable)
        if (view.status === 'in_lobby') setDone(true)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [user, userMessageCount, done, shareable])

  const banner =
    notYet && !done && !shareable ? (
      <div className="stack" style={{ gap: 'var(--space-2xs)', width: '100%' }} role="status">
        <p className="hint-inline">
          进大厅进度 <strong>{lobbyProgress(notYet)}%</strong>：{notYet.reason}，就能让社交 Agent 帮你找人、也能被别人找到。
        </p>
        <div className="grow" style={{ ['--g' as string]: String(lobbyProgress(notYet) / 100) }} />
        {notYet.userMessages >= notYet.need && (
          <div>
            <Button small variant="secondary" onClick={() => navigate('/profile')}>
              去「我的档案」整理
            </Button>
          </div>
        )}
      </div>
    ) : null

  if (!shareable || !user) return { dialog: null, banner }

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

  const dialog = (
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
  return { dialog, banner }
}
