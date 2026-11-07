import { useEffect, useRef, useState } from 'react'
import { Button, Chip } from '@components/ui/Button'
import { Card, CardHead } from '@components/ui/Card'
import { useDemoStore } from '@store/useDemoStore'
import { t } from '@i18n/t'
import { listMemories, editMemory, deleteMemory, markMemoryNotLikeMe } from '@lib/api/friend'
import { loadMemoryRows, memoryListView, performMemoryAction, applyMemoryChange, type MemoryLoadResult, type MemoryAction } from './memoryState'

/** 原有记忆列表样式：HTTP 读后端；mock 仍读 store。 */
export function MemoriesSection() {
  const s = useDemoStore()
  const httpMode = import.meta.env.VITE_API_MODE === 'http'
  const [loaded, setLoaded] = useState<MemoryLoadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editDrafts, setEditDrafts] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const generation = useRef(0)
  const busy = useRef(false)
  useEffect(() => {
    const version = ++generation.current
    busy.current = false
    void loadMemoryRows(httpMode, listMemories).then(result => {
      if (version === generation.current) setLoaded(result)
    })
    return () => { generation.current++ }
  }, [httpMode])
  const view = memoryListView(httpMode, s.memories, loaded)
  const memories = view.rows
  const startEdit = (id: string, content: string) => {
    setEditDrafts(drafts => ({ ...drafts, [id]: content })); setEditingId(id); setError(null)
  }
  const cancelEdit = () => setEditingId(null)
  const mutate = async (action: MemoryAction) => {
    if (!httpMode || busy.current) return
    busy.current = true; setEditSaving(true); setError(null)
    const version = generation.current
    const result = await performMemoryAction({ edit: editMemory, remove: deleteMemory, notLikeMe: markMemoryNotLikeMe }, action)
    if (version !== generation.current) return
    if (result.ok) {
      setLoaded(prev => prev?.ok ? { ok: true, rows: applyMemoryChange(prev.rows, result.change) } : prev)
      setEditingId(null)
    } else setError(result.error)
    busy.current = false; setEditSaving(false)
  }
  const saveEdit = (id: string) => {
    const content = (editDrafts[id] ?? '').trim()
    if (content) void mutate({ type: 'edit', id, content })
  }
  return (
    <Card>
      <CardHead title={t('profile.memories')} />
      {(view.error || error) && <p className="login-error" role="alert">{view.error || error}</p>}
      {view.loading ? <p className="empty">读取记忆中…</p> : view.error ? null : view.empty ? (
        <p className="empty">{t('profile.memoriesEmpty')}</p>
      ) : (
        <ul className="mem-list">
          {memories.map((m) => (
            <li key={m.id} className="mem">
              {editingId === m.id ? (
                <div className="stack" style={{ gap: '0.5rem' }}>
                  <textarea
                    className="input"
                    rows={2}
                    maxLength={200}
                    value={editDrafts[m.id] ?? m.content}
                    onChange={(e) => setEditDrafts((d) => ({ ...d, [m.id]: e.target.value }))}
                    style={{ resize: 'vertical', width: '100%' }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button small variant="primary" onClick={() => void saveEdit(m.id)} disabled={editSaving}>
                      {editSaving ? '保存中…' : '保存'}
                    </Button>
                    <Button small variant="secondary" onClick={cancelEdit} disabled={editSaving}>取消</Button>
                  </div>
                </div>
              ) : (
                <p>{m.content}</p>
              )}
              <footer>
                <Chip tone="well">{m.source === 'user_stated' ? '用户主动提及' : m.source === 'user_edited' ? '用户编辑' : m.source}</Chip>
                {httpMode && editingId !== m.id && (
                  <button className="mem-del" disabled={editSaving} onClick={() => startEdit(m.id, m.content)}>
                    编辑
                  </button>
                )}
                {httpMode && <button className="mem-del" disabled={editSaving} onClick={() => void mutate({ type: 'not-like-me', id: m.id })}>这不太像我</button>}
                <button className="mem-del" disabled={editSaving} onClick={() => httpMode ? void mutate({ type: 'delete', id: m.id }) : s.deleteMemory(m.id)}>
                  {t('profile.deleteMemory')}
                </button>
              </footer>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

