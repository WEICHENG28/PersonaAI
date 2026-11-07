import { afterEach, expect, it, vi } from 'vitest'
import { loadMemoryRows, performMemoryAction, applyMemoryChange, memoryListView } from '../../src/features/friend/memoryState'
import type { MemoryRow } from '../../src/lib/api/friend'
vi.mock('../../src/lib/supabase', () => ({ isHttpMode: true, supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }))
const row: MemoryRow = { id: 'memory-id', content: '喜欢画画', source: 'user_stated', confidence: 0.9, created_at: '2026-11-07T00:00:00Z', deleted_at: null }
afterEach(() => vi.unstubAllGlobals())
it('loads backend rows and never uses demo rows for http mode', async () => {
  const list = vi.fn(async () => [row])
  const loaded = await loadMemoryRows(true, list)
  expect(list).toHaveBeenCalledOnce()
  expect(memoryListView(true, [{ ...row, id: 'demo' }], loaded).rows).toEqual([row])
})
it('keeps mock store rows and makes no HTTP load', async () => {
  const list = vi.fn(async () => [row])
  const loaded = await loadMemoryRows(false, list)
  expect(list).not.toHaveBeenCalled()
  expect(memoryListView(false, [row], loaded).rows).toEqual([row])
})
it('shows a simplified load error instead of the empty state, and distinguishes loading', async () => {
  const failed = await loadMemoryRows(true, async () => { throw new Error('network private') })
  expect(memoryListView(true, [], failed)).toMatchObject({ error: '读取记忆失败，请稍后再试', empty: false, loading: false })
  expect(memoryListView(true, [], null)).toMatchObject({ empty: false, loading: true })
  expect(memoryListView(true, [], await loadMemoryRows(true, async () => []))).toMatchObject({ empty: true, loading: false })
})
it('applies successful edit/delete/not-like-me immutably using the server edit response', async () => {
  const rows = [row, { ...row, id: 'other' }]
  const edited = { ...row, content: '喜欢摄影', source: 'user_edited', confidence: 1 }
  const api = { edit: vi.fn(async () => edited), remove: vi.fn(async () => {}), notLikeMe: vi.fn(async () => {}) }
  const edit = await performMemoryAction(api, { type: 'edit', id: row.id, content: '喜欢摄影' })
  expect(edit.ok).toBe(true)
  if (edit.ok) expect(applyMemoryChange(rows, edit.change)).toEqual([edited, rows[1]])
  for (const type of ['delete', 'not-like-me'] as const) {
    const result = await performMemoryAction(api, { type, id: row.id })
    expect(result.ok).toBe(true)
    if (result.ok) expect(applyMemoryChange(rows, result.change)).toEqual([rows[1]])
  }
  expect(rows[0]).toBe(row); expect(row.content).toBe('喜欢画画')
  expect(api.remove).toHaveBeenCalledWith(row.id); expect(api.notLikeMe).toHaveBeenCalledWith(row.id)
})
it.each(['edit', 'delete', 'not-like-me'] as const)('does not change the list on failed %s', async type => {
  const fail = vi.fn(async () => { throw new Error('private') })
  const result = await performMemoryAction({ edit: fail, remove: fail, notLikeMe: fail }, type === 'edit' ? { type, id: row.id, content: 'new' } : { type, id: row.id })
  expect(result.ok).toBe(false)
  expect(JSON.stringify(result)).not.toContain('private')
  expect(result).not.toHaveProperty('change')
})
it('uses all four authenticated memory endpoints with correct methods', async () => {
  const api = await import('../../src/lib/api/friend')
  const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, data: [row] }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, data: row }) })
    .mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: null }) })
  vi.stubGlobal('fetch', fetchMock)
  expect(await api.listMemories()).toEqual([row]); expect(await api.editMemory('memory-id', 'new')).toEqual(row)
  await api.deleteMemory('memory-id'); await api.markMemoryNotLikeMe('memory-id')
  expect(fetchMock.mock.calls.map(([path, init]) => [path, init.method ?? 'GET'])).toEqual([
    ['/api/memory', 'GET'], ['/api/memory/memory-id', 'PATCH'], ['/api/memory/memory-id', 'DELETE'], ['/api/memory/memory-id/not-like-me', 'POST']])
  expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({ content: 'new' })
})
