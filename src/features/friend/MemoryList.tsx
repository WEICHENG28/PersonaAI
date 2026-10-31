import { useState } from 'react'
import { Button, Chip } from '@components/ui/Button'
import { t } from '@i18n/t'
import type { MemoriesState, MemoryItem } from './useMemories'

/** 「它记得的事」列表（朋友页侧栏、档案页共用）：置信度、删除后 5 秒可撤销、http 模式可编辑。 */
export function MemoryList({ state }: { state: MemoriesState }) {
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <>
      {state.error && <p className="login-error" role="alert">{state.error}</p>}
      {state.undoable && (
        <p className="mem-undo" role="status">
          已删除 ·{' '}
          <button className="mem-del" onClick={state.undo}>
            撤销
          </button>
        </p>
      )}
      {state.loading ? (
        <p className="empty">{t('common.loading')}</p>
      ) : state.items.length === 0 ? (
        <p className="empty">{t('profile.memoriesEmpty')}</p>
      ) : (
        <ul className="mem-list">
          {state.items.map((m) =>
            editingId === m.id && state.edit ? (
              <MemoryEditor key={m.id} memory={m} onSave={state.edit} onDone={() => setEditingId(null)} />
            ) : (
              <li key={m.id} className="mem">
                <p>{m.content}</p>
                <footer>
                  <Chip tone="well">{m.source}</Chip>
                  <Chip tone={m.confidence === 'high' ? 'mint' : 'paper'}>
                    {t('profile.confidence')}：{confidenceLabel(m.confidence)}
                  </Chip>
                  {state.edit && (
                    <button className="mem-del" onClick={() => setEditingId(m.id)}>
                      编辑
                    </button>
                  )}
                  <button className="mem-del" onClick={() => state.remove(m.id)}>
                    {t('profile.deleteMemory')}
                  </button>
                </footer>
              </li>
            ),
          )}
        </ul>
      )}
    </>
  )
}

function confidenceLabel(c: MemoryItem['confidence']): string {
  if (c === 'high') return t('profile.confHigh')
  if (c === 'mid') return t('profile.confMid')
  return t('profile.confLow')
}

interface MemoryEditorProps {
  memory: MemoryItem
  onSave: (id: string, content: string) => Promise<void>
  onDone: () => void
}

function MemoryEditor({ memory, onSave, onDone }: MemoryEditorProps) {
  const [draft, setDraft] = useState(memory.content)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!draft.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onSave(memory.id, draft.trim())
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，请再试一次')
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="mem stack">
      <textarea className="input" rows={2} maxLength={200} value={draft} onChange={(e) => setDraft(e.target.value)} />
      {error && <p className="login-error">{error}</p>}
      <div className="next-actions">
        <Button small onClick={() => void save()} disabled={saving || !draft.trim()}>
          {saving ? '保存中…' : t('common.save')}
        </Button>
        <Button small variant="secondary" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </li>
  )
}
