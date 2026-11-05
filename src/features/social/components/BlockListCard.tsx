import { useEffect, useState } from 'react'
import { Button } from '@components/ui/Button'
import { Card, CardHead } from '@components/ui/Card'
import { listBlocks, unblockUser } from '@lib/api/social'

/** 设置页「已屏蔽的人」（http 模式）：列出我屏蔽的人，可以取消屏蔽。没有屏蔽任何人就不显示。擁有者：B。 */
export function BlockListCard() {
  const [items, setItems] = useState<{ userId: string; name: string }[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listBlocks().then(setItems).catch(() => {})
  }, [])

  if (!items.length) return null

  const unblock = async (userId: string) => {
    setBusy(userId)
    setError(null)
    try {
      await unblockUser(userId)
      setItems((list) => list.filter((i) => i.userId !== userId))
    } catch (e) {
      setError(e instanceof Error ? e.message : '没有成功，请再试一次')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card style={{ marginTop: 'var(--space-lg)' }}>
      <CardHead title="已屏蔽的人" sub="你们互相看不到，也不能开新的聊天。取消后对方会重新出现在大厅" />
      {error && <p className="login-error">{error}</p>}
      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map((i) => (
          <li key={i.userId} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <strong>{i.name}</strong>
            <span style={{ marginLeft: 'auto' }}>
              <Button small variant="secondary" disabled={busy === i.userId} onClick={() => void unblock(i.userId)}>
                取消屏蔽
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
