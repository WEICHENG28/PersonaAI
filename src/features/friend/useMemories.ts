import { useCallback, useEffect, useRef, useState } from 'react'
import { useDemoStore } from '@store/useDemoStore'
import type { Memory } from '@lib/api/types'
import { deleteMemory, editMemory, fetchMemories, isHttpMode, type MemoryRow } from '@lib/api/friend'

/**
 * 「它记得的事」的资料来源（朋友页侧栏、档案页共用）。
 * mock：demo store；http：GET/DELETE/PATCH /api/memory（UX #10、#11）。
 * 删除可在 5 秒内撤销（UX #22）：mock 先删再还原；http 先藏起来，5 秒后才真的打 DELETE。
 */

export const UNDO_MS = 5000

export interface MemoryItem {
  id: string
  content: string
  source: string
  confidence: Memory['confidence']
}

export interface MemoriesState {
  items: MemoryItem[]
  loading: boolean
  error: string | null
  /** 刚删掉、还能撤销的那一条 */
  undoable: MemoryItem | null
  remove: (id: string) => void
  undo: () => void
  /** 只有 http 模式能编辑 */
  edit: ((id: string, content: string) => Promise<void>) | null
}

const SOURCE_LABEL: Record<string, string> = { user_stated: '用户主动提及', user_edited: '你修改过' }

function fromRow(r: MemoryRow): MemoryItem {
  const confidence = r.confidence >= 0.75 ? 'high' : r.confidence >= 0.45 ? 'mid' : 'low'
  return { id: r.id, content: r.content, source: SOURCE_LABEL[r.source] ?? r.source, confidence }
}

export function useMemories(): MemoriesState {
  return isHttpMode ? useHttpMemories() : useMockMemories()
}

function useMockMemories(): MemoriesState {
  const memories = useDemoStore((s) => s.memories)
  const deleteOne = useDemoStore((s) => s.deleteMemory)
  const restore = useDemoStore((s) => s.restoreMemory)
  const [undoable, setUndoable] = useState<{ memory: Memory; index: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const remove = useCallback(
    (id: string) => {
      const index = memories.findIndex((m) => m.id === id)
      if (index < 0) return
      deleteOne(id)
      setUndoable({ memory: memories[index]!, index })
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setUndoable(null), UNDO_MS)
    },
    [memories, deleteOne],
  )

  const undo = useCallback(() => {
    if (!undoable) return
    restore(undoable.memory, undoable.index)
    setUndoable(null)
  }, [undoable, restore])

  return { items: memories, loading: false, error: null, undoable: undoable?.memory ?? null, remove, undo, edit: null }
}

function useHttpMemories(): MemoriesState {
  const [items, setItems] = useState<MemoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState<MemoryItem | null>(null)
  const pending = useRef<{ target: MemoryItem; timer: ReturnType<typeof setTimeout> } | null>(null)

  useEffect(() => {
    fetchMemories()
      .then((rows) => setItems(rows.map(fromRow)))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '读取记忆失败'))
      .finally(() => setLoading(false))
  }, [])

  // 先从列表拿掉，失败再放回去并显示错误
  const commit = useCallback((target: MemoryItem) => {
    setItems((list) => list.filter((m) => m.id !== target.id))
    deleteMemory(target.id).catch((e: unknown) => {
      setItems((list) => [target, ...list])
      setError(e instanceof Error ? e.message : '删除失败，请再试一次')
    })
  }, [])

  // 离开页面时还没撤销的删除照样送出
  useEffect(() => () => {
    if (!pending.current) return
    clearTimeout(pending.current.timer)
    void deleteMemory(pending.current.target.id).catch(() => {})
  }, [])

  const remove = useCallback(
    (id: string) => {
      const target = items.find((m) => m.id === id)
      if (!target) return
      if (pending.current) {
        clearTimeout(pending.current.timer)
        commit(pending.current.target)
      }
      setError(null)
      setHidden(target)
      const timer = setTimeout(() => {
        pending.current = null
        setHidden(null)
        commit(target)
      }, UNDO_MS)
      pending.current = { target, timer }
    },
    [items, commit],
  )

  const undo = useCallback(() => {
    if (pending.current) clearTimeout(pending.current.timer)
    pending.current = null
    setHidden(null)
  }, [])

  const edit = useCallback(async (id: string, content: string) => {
    const row = await editMemory(id, content)
    setItems((list) => list.map((m) => (m.id === id ? fromRow(row) : m)))
  }, [])

  const visible = hidden ? items.filter((m) => m.id !== hidden.id) : items
  return { items: visible, loading, error, undoable: hidden, remove, undo, edit }
}
