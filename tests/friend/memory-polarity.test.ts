import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemoryRow } from '../../server/friend/memory.js'

type Stored = MemoryRow & { user_id: string }
type Operation = { kind: string; table: string; filters: [string, unknown][]; patch?: Record<string, unknown> }
const mock = vi.hoisted(() => ({ from: vi.fn(), llm: vi.fn(), log: vi.fn() }))
vi.mock('../../server/lib/supabase.js', () => ({ getServiceClient: () => ({ from: mock.from }) }))
vi.mock('../../server/lib/llm/index.js', () => ({ llmJson: mock.llm }))
vi.mock('../../server/lib/log.js', () => ({ writeLog: mock.log }))
import { extractMemories } from '../../server/friend/memory.js'

const state = { rows: [] as Stored[], ops: [] as Operation[], updateError: null as unknown, insertError: null as unknown, updateErrorForId: null as string | null }
function memory(content: string, id = 'old', user_id = 'u1', deleted_at: string | null = null): Stored {
  return { id, user_id, content, source: 'user_stated', confidence: 0.9, created_at: '2026-11-07T00:00:00Z', deleted_at }
}

/** 每個 from 有自己的 query 狀態，eq/is 真正限制被更新的列；全為記憶體資料。 */
function makeTable(table: string) {
  const filters: [string, unknown][] = []
  let patch: Record<string, unknown> | undefined
  const execute = () => {
    state.ops.push({ kind: patch ? 'update' : 'select', table, filters: [...filters], patch })
    if (patch && state.updateError && (!state.updateErrorForId || filters.some(([key, value]) => key === 'id' && value === state.updateErrorForId))) {
      return { data: [] as Stored[], error: state.updateError }
    }
    const rows = table === 'user_memory' ? state.rows.filter(row => filters.every(([key, value]) => row[key as keyof Stored] === value)) : []
    if (patch) for (const row of rows) Object.assign(row, patch)
    // 模擬 DB 快照；後續編輯不能改掉先前 SELECT 的回傳內容。
    return { data: rows.map(row => ({ ...row })), error: null }
  }
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn((key: string, value: unknown) => { filters.push([key, value]); return q }),
    is: vi.fn((key: string, value: unknown) => { filters.push([key, value]); return q }),
    order: vi.fn(() => q),
    limit: vi.fn(async () => execute()),
    update: vi.fn((value: Record<string, unknown>) => { patch = value; return q }),
    maybeSingle: vi.fn(async () => { const result = execute(); return { ...result, data: result.data[0] ?? null } }),
    single: vi.fn(async () => { const result = execute(); return { ...result, data: result.data[0] ?? null } }),
    insert: vi.fn(async (rows: { content: string; user_id: string; confidence: number; source: string }[]) => {
      state.ops.push({ kind: 'insert', table, filters: [] })
      if (state.insertError) return { error: state.insertError }
      state.rows.push(...rows.map((row, i) => ({ ...memory(row.content, `new-${i}`, row.user_id), ...row })))
      return { error: null }
    }),
  }
  return q
}
beforeEach(() => {
  state.rows = []; state.ops = []; state.updateError = null; state.insertError = null; state.updateErrorForId = null
  mock.from.mockReset().mockImplementation(makeTable)
  mock.llm.mockReset().mockResolvedValue({ memories: [{ content: '用户不喜欢跑步', confidence: 0.9 }] })
  mock.log.mockReset().mockResolvedValue(undefined)
})

describe('extractMemories 正反软删除流程', () => {
  it('只软删同用户的相反完整主题，在插入新记忆之前，并写指定理由', async () => {
    const old = memory('用户喜欢跑步')
    const machine = memory('用户喜欢跑步机', 'machine')
    const otherUser = memory('用户喜欢跑步', 'other', 'u2')
    const deleted = memory('用户喜欢跑步', 'deleted', 'u1', '2026-11-06T00:00:00Z')
    state.rows.push(old, machine, otherUser, deleted)
    expect(await extractMemories('u1', '我不喜欢跑步')).toBe(1)
    expect(old.deleted_at).toEqual(expect.any(String))
    expect(machine.deleted_at).toBeNull()
    expect(otherUser.deleted_at).toBeNull()
    expect(deleted.deleted_at).toBe('2026-11-06T00:00:00Z')
    const update = state.ops.find(op => op.kind === 'update')!
    expect(update.patch).toEqual({ deleted_at: expect.any(String) })
    expect(update.filters).toEqual(expect.arrayContaining([['id', 'old'], ['user_id', 'u1'], ['deleted_at', null]]))
    expect(state.ops.indexOf(update)).toBeLessThan(state.ops.findIndex(op => op.kind === 'insert'))
    expect(mock.log).toHaveBeenCalledWith(expect.objectContaining({ reason: '新记忆与旧记忆相反，旧记忆已移除：用户喜欢跑步' }))
    expect(state.rows.some(row => row.content === '用户不喜欢跑步' && row.deleted_at === null)).toBe(true)
  })

  it('否定改成肯定时也删除旧否定', async () => {
    const old = memory('用户不喜欢跑步'); state.rows.push(old)
    mock.llm.mockResolvedValue({ memories: [{ content: '用户喜欢跑步', confidence: 0.9 }] })
    expect(await extractMemories('u1', '我喜欢跑步')).toBe(1)
    expect(old.deleted_at).toEqual(expect.any(String))
  })

  it('用户喜欢跑步和用户不喜欢跑步机不相反', async () => {
    const old = memory('用户喜欢跑步'); state.rows.push(old)
    mock.llm.mockResolvedValue({ memories: [{ content: '用户不喜欢跑步机', confidence: 0.9 }] })
    expect(await extractMemories('u1', '我不喜欢跑步机')).toBe(1)
    expect(old.deleted_at).toBeNull()
    expect(state.ops.some(op => op.kind === 'update')).toBe(false)
  })

  it('正确新记忆已存在时不重复插入，但仍移除另一条相反旧记忆', async () => {
    const old = memory('用户喜欢跑步'); state.rows.push(old, memory('用户不喜欢跑步', 'current'))
    expect(await extractMemories('u1', '我不喜欢跑步')).toBe(0)
    expect(old.deleted_at).toEqual(expect.any(String))
    expect(state.ops.some(op => op.kind === 'insert')).toBe(false)
  })

  it('软删除失败就 throw，不继续插入或记录已删除', async () => {
    state.rows.push(memory('用户喜欢跑步'))
    state.updateError = { message: 'db offline' }
    await expect(extractMemories('u1', '我不喜欢跑步')).rejects.toThrow('移除旧记忆失败')
    expect(state.ops.some(op => op.kind === 'insert')).toBe(false)
    expect(mock.log).not.toHaveBeenCalled()
    expect(state.rows[0]?.deleted_at).toBeNull()
  })

  it('LLM 等待期间已被编辑成别的主题的旧记忆不被误删', async () => {
    const old = memory('用户喜欢跑步'); state.rows.push(old)
    mock.llm.mockImplementation(async () => {
      old.content = '用户喜欢跑步机'
      return { memories: [{ content: '用户不喜欢跑步', confidence: 0.9 }] }
    })
    expect(await extractMemories('u1', '我不喜欢跑步')).toBe(1)
    expect(old.deleted_at).toBeNull()
    expect(mock.log.mock.calls.some(([entry]) => entry.reason.startsWith('新记忆与旧记忆相反'))).toBe(false)
  })

  it('新记忆插入失败时恢复本轮已删除的旧记忆，不留下空白', async () => {
    const old = memory('用户喜欢跑步'); state.rows.push(old)
    state.insertError = { message: 'insert offline' }
    await expect(extractMemories('u1', '我不喜欢跑步')).rejects.toThrow('写入记忆失败')
    expect(old.deleted_at).toBeNull()
    const removed = state.ops.find(op => op.kind === 'update' && op.patch?.deleted_at !== null)!
    const restored = state.ops.find(op => op.kind === 'update' && op.patch?.deleted_at === null)!
    expect(restored.filters).toEqual(expect.arrayContaining([
      ['id', 'old'], ['user_id', 'u1'], ['content', '用户喜欢跑步'], ['deleted_at', removed.patch!.deleted_at],
    ]))
  })

  it('第二条软删除失败时也恢复先前已删除的第一条', async () => {
    const first = memory('用户喜欢跑步'), second = memory('用户喜欢摄影', 'second')
    state.rows.push(first, second)
    state.updateErrorForId = 'second'; state.updateError = { message: 'update offline' }
    mock.llm.mockResolvedValue({ memories: [
      { content: '用户不喜欢跑步', confidence: 0.9 }, { content: '用户不喜欢摄影', confidence: 0.9 },
    ] })
    await expect(extractMemories('u1', '我不喜欢跑步和摄影')).rejects.toThrow('移除旧记忆失败')
    expect(first.deleted_at).toBeNull()
    expect(second.deleted_at).toBeNull()
    expect(state.ops.some(op => op.kind === 'insert')).toBe(false)
  })

  it.each(['edit', 'delete'])('LLM 等待期间同向记忆已被 %s，去重必须读当前资料', async (mode) => {
    const positive = memory('用户喜欢跑步'), negative = memory('用户不喜欢跑步', 'negative')
    state.rows.push(positive, negative)
    mock.llm.mockImplementation(async () => {
      if (mode === 'edit') negative.content = '用户喜欢摄影'
      else negative.deleted_at = '2026-11-07T00:01:00Z'
      return { memories: [{ content: '用户不喜欢跑步', confidence: 0.9 }] }
    })
    expect(await extractMemories('u1', '我不喜欢跑步')).toBe(1)
    expect(state.rows.filter(row => row.deleted_at === null && row.content === '用户不喜欢跑步')).toHaveLength(1)
  })
})
