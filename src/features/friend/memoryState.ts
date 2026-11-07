import type { MemoryRow } from '../../lib/api/friend'
type MemoryItem = Pick<MemoryRow, 'id' | 'content' | 'source'>
export type MemoryLoadResult = { ok: true; rows: MemoryRow[] } | { ok: false; error: string }
export type MemoryAction = { type: 'edit'; id: string; content: string } | { type: 'delete' | 'not-like-me'; id: string }
export type MemoryChange = { type: 'edit'; row: MemoryRow } | { type: 'remove'; id: string }
interface MemoryApi {
  edit(id: string, content: string): Promise<MemoryRow>
  remove(id: string): Promise<void>
  notLikeMe(id: string): Promise<void>
}
/** 注入数据源便于离线测试；mock 模式不调用 HTTP。 */
export async function loadMemoryRows(http: boolean, list: () => Promise<MemoryRow[]>): Promise<MemoryLoadResult | null> {
  if (!http) return null
  try { return { ok: true, rows: (await list()).filter(row => row.deleted_at === null) } }
  catch { return { ok: false, error: '读取记忆失败，请稍后再试' } }
}
/** 只有成功读到空列表才能显示空状态，失败与载入中都不是「没有记忆」。 */
export function memoryListView(http: boolean, store: MemoryItem[], result: MemoryLoadResult | null) {
  if (!http) return { rows: store, loading: false, error: null, empty: store.length === 0 }
  const rows = result?.ok ? result.rows : []
  return { rows, loading: result === null, error: result && !result.ok ? result.error : null,
    empty: result?.ok === true && rows.length === 0 }
}
export async function performMemoryAction(api: MemoryApi, action: MemoryAction): Promise<
  { ok: true; change: MemoryChange } | { ok: false; error: string }
> {
  try {
    if (action.type === 'edit') return { ok: true, change: { type: 'edit', row: await api.edit(action.id, action.content) } }
    if (action.type === 'delete') await api.remove(action.id)
    else await api.notLikeMe(action.id)
    return { ok: true, change: { type: 'remove', id: action.id } }
  } catch {
    return { ok: false, error: action.type === 'edit' ? '保存失败，请再试一次' : action.type === 'delete' ? '删除失败，请再试一次' : '操作失败，请再试一次' }
  }
}
/** 只在服务器成功后更新，并保留其他记忆；不原地改写 store 或旧状态。 */
export function applyMemoryChange(rows: MemoryRow[], change: MemoryChange): MemoryRow[] {
  return change.type === 'remove' ? rows.filter(row => row.id !== change.id)
    : rows.map(row => row.id === change.row.id ? change.row : row).filter(row => row.deleted_at === null)
}
