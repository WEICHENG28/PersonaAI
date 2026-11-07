// 共用测试夹具：仅内存表与固定 LLM 输出，不连接任何服务。
import { vi } from 'vitest'
export const tables: Record<string, TableMock> = {}
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
  upsert: ReturnType<typeof vi.fn>
}

export function validExtract() {
  return {
    shareable_profile: {
      intro: '喜欢看展的二次元',
      interests: ['动漫', '看展'],
      chat_style: '句子不长，先回应情绪',
      looking_for: '可以一起逛展的朋友',
    },
    agent_profile: {
      big_five: {
        O: { score: 72, confidence: 0.6, evidence: '多次提到尝试新活动' },
        C: { score: 50, confidence: 0.1, evidence: '' },
        E: { score: 38, confidence: 0.3, evidence: '偶尔提到小圈子' },
        A: { score: 70, confidence: 0.5, evidence: '对朋友的事情表现出关心' },
        N: { score: 45, confidence: 0.2, evidence: '' },
      },
      values: ['真诚'],
      style: { sentence_length: 'short', tone: '温和', emoji_level: 1, formality: 'casual' },
    },
  }
}

export function makeTable(name: string): TableMock {
  let filters: [string, unknown][] = []
  let descending = false
  let head = false
  const filtered = () => t.list.filter(row => filters.every(([key, value]) => row[key] === value))
  const t: TableMock = {
    list: [],
    select: vi.fn((_columns: string, opts?: { count?: string; head?: boolean }) => { filters = []; descending = false; head = opts?.head ?? false; return t.self }),
    eq: vi.fn((key: string, value: unknown) => { filters.push([key, value]); return t.self }),
    is: vi.fn(() => t.self),
    order: vi.fn((_key: string, opts?: { ascending: boolean }) => { descending = opts?.ascending === false; return t.self }),
    limit: vi.fn(async (n: number) => { const rows = name === 'friend_messages' ? filtered() : [...t.list]; return { data: (descending ? [...rows].reverse() : rows).slice(0, n), error: null } }),
    maybeSingle: vi.fn(async () => ({ data: t.list[0] ?? null, error: null })),
    single: vi.fn(async () =>
      t.list[0] ? { data: t.list[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } },
    ),
    insert: vi.fn((row: Record<string, unknown> | Record<string, unknown>[]) => {
      t.list.push(...(Array.isArray(row) ? row : [row]))
      return { select: () => ({ single: t.single }) }
    }),
    upsert: vi.fn((row: Record<string, unknown>) => {
      t.list.length = 0
      t.list.push(row)
      return { error: null }
    }),
    update: vi.fn((patch: Record<string, unknown>) => {
      Object.assign(t.list[0] ?? {}, patch)
      return t.self
    }),
  }
  Object.assign(t, { self: t, then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: head ? null : filtered(), count: filtered().length, error: null }).then(resolve) })
  tables[name] = t
  return t
}

export function failTable(name: string) {
  throw new Error(`测试未 mock 表 ${name}`)
}
