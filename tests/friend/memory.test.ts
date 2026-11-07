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
import { editMemory, extractMemories, isDuplicateMemory, memoryTopicKey, findContradicted, listMemories, deleteMemory, markNotLikeMe, type MemoryRow } from '../../server/friend/memory'
import { memoryPromptUser, renderMemorySystem } from '../../server/prompts/02_memory'

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
  it.each([
    ['不喜欢昆虫', '喜欢昆虫'], ['喜欢昆虫', '不喜欢昆虫'],
    ['不太喜欢昆虫', '喜欢昆虫'], ['讨厌昆虫', '喜欢昆虫'],
  ])('正反不同不算重复：%s / %s', (fresh, old) => {
    expect(isDuplicateMemory(fresh, [old])).toBe(false)
  })
  it('同为否定时仍保留包含去重', () => {
    expect(isDuplicateMemory('用户不喜欢昆虫', ['用户不喜欢昆虫和蜘蛛'])).toBe(true)
  })
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

describe('memoryTopicKey / findContradicted', () => {
  const row = (content: string, id = 'm1', deleted_at: string | null = null): MemoryRow => ({
    id, content, source: 'user_stated', confidence: 0.9, created_at: '2026-11-07T00:00:00Z', deleted_at,
  })
  it.each(['用户喜欢跑步', ' 用户 不太喜欢「跑步」！ ', '用户很喜欢跑步', '用户怕跑步', '用户不爱跑步'])(
    '去掉用户、M-1 否定词／喜欢前缀和标点：%s', content => {
      expect(memoryTopicKey(content)).toBe('跑步')
    },
  )
  it('仅相同完整主题且正反相反时推翻，原始资料不变', () => {
    const rows = [row('用户喜欢跑步'), row('用户喜欢跑步机', 'machine'), row('用户不喜欢跑步', 'same'), row('用户喜欢跑步', 'deleted', '2026-11-06')]
    expect(findContradicted('用户不喜欢跑步', rows)).toEqual([rows[0]])
    expect(findContradicted('用户喜欢跑步', [rows[2]!])).toEqual([rows[2]])
    expect(findContradicted('用户不喜欢跑步机', [rows[0]!])).toEqual([])
    expect(rows[0]?.deleted_at).toBeNull()
  })
  it('空主题不删除旧记忆', () => {
    expect(findContradicted('用户不喜欢', [row('用户喜欢')])).toEqual([])
  })
  it.each([
    ['用户不喜欢跑步，觉得太累且坚持不下去', '用户最近开始喜欢跑步，每天晚上跑三公里', 1],
    ['用户喜欢爬山', '用户对爬山没兴趣，觉得太累', 1],
    ['用户不喜欢跑步', '用户喜欢跑步机', 0],
    ['用户以前常打篮球，现在不打了', '用户喜欢打篮球', 0],
  ])('真实模型输出：%s / %s → %i 条相反记忆', (fresh, old, count) => {
    expect(findContradicted(fresh, [row(old)])).toHaveLength(count)
  })
  it('只以首子句取街拍主题，忽略后续细节', () => {
    expect(memoryTopicKey('用户喜欢街拍，周末常出去拍摄')).toBe('街拍')
  })
  it.each(['，', ',', '。', '；', ';', '、'])('在首个 %s 前截断', delimiter => {
    expect(memoryTopicKey(`用户喜欢街拍${delimiter}周末常出去拍摄`)).toBe('街拍')
  })
  it.each(['最近', '开始', '一直', '现在', '其实', '真的', '还是', '也', '都', '本来', '最近开始', '其实真的也一直'])(
    '连续移除开头时间／语气词：%s', prefix => {
      expect(memoryTopicKey(`用户${prefix}喜欢跑步了的 `)).toBe('跑步')
    },
  )
  it.each(['用户「喜欢跑步」', '用户「最近开始喜欢跑步」'])(
    '保留原有标点整理，带引号前缀也能取主題：%s', content => {
      expect(memoryTopicKey(content)).toBe('跑步')
    },
  )
  it('引号包住喜欢前缀时仍能找到相反记忆', () => {
    expect(findContradicted('用户不喜欢跑步', [row('用户「喜欢跑步」')])).toHaveLength(1)
  })
  it.each([
    ['用户喜欢跑步，但不喜欢游泳', '用户喜欢跑步', 0],
    ['用户喜欢跑步，不再熬夜', '用户喜欢跑步', 0],
    ['用户不喜欢跑步', '用户喜欢跑步，但不喜欢游泳', 1],
    ['用户喜欢跑步', '用户不喜欢跑步，但喜欢游泳', 1],
  ])('正反与主題都只看首子句：%s / %s → %i', (fresh, old, count) => {
    expect(findContradicted(fresh, [row(old)])).toHaveLength(count)
  })
})

describe('renderMemorySystem', () => {
  it('占位符全部替换', () => {
    const sys = renderMemorySystem({ text: '我周末要去漫展', recent: '用户：…', existing: '（无）' })
    for (const ph of ['{{text}}', '{{recent}}', '{{existing}}']) {
      expect(sys).not.toContain(ph)
    }
    expect(sys).toContain('我周末要去漫展')
    expect(sys).toContain('否定要原样保留')
    expect(sys).toContain('过去的事写清楚是过去')
    expect(sys).toContain('别人的事不记')
    expect(sys).toContain('confidence 不超过 0.5')
  })

  it('只替换原始模板一次，保留用户的 $&、$1 和 {{recent}} 原文', () => {
    const sys = renderMemorySystem({ text: '$& {{recent}}', recent: '$1 {{existing}}', existing: '$& {{text}}' })
    expect(sys).toContain('- 最新讯息：$& {{recent}}')
    expect(sys).toContain('- 最近 6 则对话（只用来理解上下文，不要从阿澈说的话里撷取）：$1 {{existing}}')
    expect(sys).toContain('- 已存在的记忆：$& {{text}}')
  })

  it('user 讯息固定简短，不再重复 text', () => {
    expect(memoryPromptUser()).toBe('请按规则撷取上面这则最新讯息的记忆，只输出 JSON。')
  })
})

describe('extractMemories（mock LLM/DB）', () => {
  it('实际 LLM 呼叫只在 system 填最新讯息，user 使用短指令', async () => {
    await extractMemories('u1', '$& {{recent}}')
    const opts = vi.mocked(llmJson).mock.calls[0]![0]
    expect(opts.system).toContain('- 最新讯息：$& {{recent}}')
    expect(opts.messages).toEqual([{ role: 'user', content: '请按规则撷取上面这则最新讯息的记忆，只输出 JSON。' }])
  })
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

it('queries only latest six messages and renders them chronologically', async () => {
  const table = tables.friend_messages!
  table.limit.mockResolvedValueOnce({ data: [6, 5, 4, 3, 2, 1].map(n => ({ role: 'user', content: `recent-${n}` })), error: null })
  await extractMemories('u1', 'now')
  expect(table.order).toHaveBeenCalledWith('created_at', { ascending: false })
  expect(table.limit).toHaveBeenCalledWith(6)
  const system = vi.mocked(llmJson).mock.calls[0]![0].system
  expect(system.indexOf('recent-1')).toBeLessThan(system.indexOf('recent-6'))
})
it('edits user_memory with ownership and soft deletion filters', async () => {
  tables.user_memory!.list.push({ id: 'm1', user_id: 'u1', content: 'old', deleted_at: null })
  expect(await editMemory('u1', 'm1', ' new ')).toMatchObject({ content: 'new', source: 'user_edited', confidence: 1 })
  expect(tables.user_memory!.eq).toHaveBeenCalledWith('user_id', 'u1')
  expect(tables.user_memory!.eq).toHaveBeenCalledWith('id', 'm1')
  expect(tables.user_memory!.is).toHaveBeenCalledWith('deleted_at', null)
})
