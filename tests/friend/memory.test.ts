/**
 * A3 必测：isDuplicateMemory（去重规则）＋ extractMemories 流程（LLM/DB mock）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── mock Supabase：按表分 chain ──
const tables: Record<string, TableMock> = {}

interface TableMock {
  list: Record<string, unknown>[]
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  is: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}

vi.mock('../../server/lib/supabase', () => ({
  getServiceClient: () => ({
    from: (name: string) => tables[name]?.self ?? failTable(name),
  }),
}))
vi.mock('../../server/lib/llm', () => ({
  llmJson: vi.fn(async () => ({ memories: [] })),
}))
vi.mock('../../server/lib/log', () => ({ writeLog: vi.fn(async () => {}) }))

import { llmJson } from '../../server/lib/llm'
import { writeLog } from '../../server/lib/log'
import { extractMemories, isDuplicateMemory, listMemories, deleteMemory, markNotLikeMe } from '../../server/friend/memory'
import { renderMemorySystem } from '../../server/prompts/02_memory'

function makeTable(name: string): TableMock {
  const t: TableMock = {
    list: [],
    select: vi.fn(() => t.self),
    eq: vi.fn(() => t.self),
    is: vi.fn(() => t.self),
    order: vi.fn(() => t.self),
    limit: vi.fn(async () => ({ data: t.list, error: null })),
    maybeSingle: vi.fn(async () => ({ data: t.list[0] ?? null, error: null })),
    single: vi.fn(async () =>
      t.list[0] ? { data: t.list[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } },
    ),
    insert: vi.fn((row: Record<string, unknown> | Record<string, unknown>[]) => {
      t.list.push(...(Array.isArray(row) ? row : [row]))
      return { select: () => ({ single: t.single }) }
    }),
    update: vi.fn((patch: Record<string, unknown>) => {
      Object.assign(t.list[0] ?? {}, patch)
      return t.self
    }),
  }
  Object.assign(t, { self: t })
  tables[name] = t
  return t
}

function failTable(name: string) {
  throw new Error(`测试未 mock 表 ${name}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(tables)) delete tables[k]
  makeTable('user_memory')
  makeTable('friend_messages').list.push(
    { role: 'user', content: '我周末要去漫展' },
    { role: 'friend', content: '听起来不错' },
  )
})

describe('isDuplicateMemory（必测）', () => {
  it('完全相同算重复', () => {
    expect(isDuplicateMemory('用户计划周末去漫展', ['用户计划周末去漫展'])).toBe(true)
  })
  it('互相包含算重复（新包含旧、旧包含新）', () => {
    expect(isDuplicateMemory('用户计划周末去漫展', ['计划周末去漫展'])).toBe(true)
    expect(isDuplicateMemory('喜欢登山', ['用户喜欢登山，常去爬山'])).toBe(true)
  })
  it('不同内容不算重复', () => {
    expect(isDuplicateMemory('用户喜欢登山', ['用户计划周末去漫展'])).toBe(false)
  })
  it('空字符串算重复（不写入）', () => {
    expect(isDuplicateMemory('   ', ['任意'])).toBe(true)
    expect(isDuplicateMemory('x', [])).toBe(false)
  })
  it('单字不算包含重复', () => {
    // 「山」包含于「登山」但长度 1 < 2，不算
    expect(isDuplicateMemory('山', ['喜欢登山'])).toBe(false)
  })
  it('忽略首尾空白', () => {
    expect(isDuplicateMemory('  用户喜欢登山  ', ['用户喜欢登山'])).toBe(true)
  })
})

describe('renderMemorySystem', () => {
  it('占位符全部替换', () => {
    const sys = renderMemorySystem({ text: '我周末要去漫展', recent: '用户：…', existing: '（无）' })
    for (const ph of ['{{text}}', '{{recent}}', '{{existing}}']) {
      expect(sys).not.toContain(ph)
    }
    expect(sys).toContain('我周末要去漫展')
  })
})

describe('extractMemories（mock LLM/DB）', () => {
  it('新记忆写入并返回条数', async () => {
    vi.mocked(llmJson).mockResolvedValueOnce({
      memories: [
        { content: '用户计划周末去漫展', confidence: 0.9 },
        { content: '用户喜欢登山', confidence: 0.8 },
      ],
    } as never)
    const n = await extractMemories('u1', '我周末要去漫展，我也喜欢登山')
    expect(n).toBe(2)
    expect(tables['user_memory']!.list).toHaveLength(2)
    expect(tables['user_memory']!.list[0]).toMatchObject({ source: 'user_stated', confidence: 0.9 })
    expect(writeLog).toHaveBeenCalled()
  })

  it('与现有记忆重复的被过滤', async () => {
    tables['user_memory']!.list.push({ content: '用户计划周末去漫展', user_id: 'u1' })
    vi.mocked(llmJson).mockResolvedValueOnce({
      memories: [
        { content: '用户计划周末去漫展', confidence: 0.9 }, // 完全同
        { content: '用户喜欢看展', confidence: 0.7 },
      ],
    } as never)
    const n = await extractMemories('u1', '我周末要去漫展')
    expect(n).toBe(1)
    expect(tables['user_memory']!.list).toHaveLength(2)
  })

  it('LLM 回空数组不写入', async () => {
    vi.mocked(llmJson).mockResolvedValueOnce({ memories: [] } as never)
    const n = await extractMemories('u1', '哈哈')
    expect(n).toBe(0)
    expect(tables['user_memory']!.list).toHaveLength(0)
  })

  it('confidence 超范围被夹到 [0,1]', async () => {
    vi.mocked(llmJson).mockResolvedValueOnce({
      memories: [{ content: '用户喜欢夜跑', confidence: 1.7 }],
    } as never)
    await extractMemories('u1', '我最近常夜跑')
    expect(tables['user_memory']!.list[0]).toMatchObject({ confidence: 1 })
  })
})

describe('listMemories / deleteMemory / markNotLikeMe', () => {
  it('listMemories 只取未删除（mock eq/is 生效即可，这里验证调用链不抛错）', async () => {
    tables['user_memory']!.list.push(
      { id: 'm1', content: '用户喜欢登山', deleted_at: null },
    )
    const rows = await listMemories('u1')
    expect(rows).toHaveLength(1)
  })

  it('deleteMemory 更新 deleted_at 并写日志', async () => {
    tables['user_memory']!.list.push({ id: 'm1', content: 'x', deleted_at: null })
    const ok = await deleteMemory('u1', 'm1')
    expect(ok).toBe(true)
    expect(tables['user_memory']!.list[0]).toHaveProperty('deleted_at')
    expect(writeLog).toHaveBeenCalled()
  })

  it('markNotLikeMe 等同删除但日志不同', async () => {
    tables['user_memory']!.list.push({ id: 'm1', content: 'x', deleted_at: null })
    const ok = await markNotLikeMe('u1', 'm1')
    expect(ok).toBe(true)
  })
})
