import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentLogInput, ShareableProfile } from '../../shared/types'
import { setLlmClient } from '../../server/lib/llm'
import { setLogWriter } from '../../server/lib/log'
import { cosineSimilarity, matchesKeyword, parseVector, rankCandidates, searchLobby, setLobbySource, type LobbyEntry } from '../../server/social/lobby'

beforeAll(() => {
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  Object.assign(process.env, {
    LLM_BASE_URL: 'https://example.test/v1',
    LLM_API_KEY: 'test',
    MODEL_CHAT: 'c',
    MODEL_REASON: 'r',
    MODEL_FAST: 'f',
    MODEL_EMBED: 'e',
    EMBEDDING_DIM: '2',
  })
})

const profile = (interests: string[]): ShareableProfile => ({ intro: '', interests, chat_style: '', looking_for: '' })
const entry = (id: string, interests: string[], embedding: number[] | null, purposes: LobbyEntry['purposes'] = ['sport', 'friend']): LobbyEntry => ({
  user_id: id,
  display_name: id,
  purposes,
  shareable: profile(interests),
  embedding,
})

let logs: AgentLogInput[] = []
beforeEach(() => {
  logs = []
  setLogWriter(async (e) => {
    logs.push(e)
  })
})
afterEach(() => {
  setLlmClient(null)
  setLogWriter(null)
  setLobbySource(null)
})

function fakeEmbed(vector: number[] | Error) {
  const embed = vi.fn(async () => {
    if (vector instanceof Error) throw vector
    return vector
  })
  setLlmClient({ chat: async () => '', embed })
  return embed
}

describe('cosineSimilarity', () => {
  it('同方向為 1、垂直為 0、長度不同或零向量為 0', () => {
    expect(cosineSimilarity([1, 2], [2, 4])).toBeCloseTo(1)
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0)
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0)
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0)
  })
})

describe('rankCandidates', () => {
  it('依相似度排序，興趣命中條件的加 0.1', () => {
    const ranked = rankCandidates(
      [entry('a', ['看书'], [1, 0]), entry('b', ['登山'], [0.95, 0.312]), entry('c', ['游泳'], [0, 1])],
      [1, 0],
      ['喜欢登山'],
    )
    expect(ranked.map((r) => r.user_id)).toEqual(['b', 'a', 'c'])
    expect(ranked[0]?.similarity).toBeCloseTo(1.05, 2)
    expect(ranked[1]?.similarity).toBe(1)
  })

  it('沒有向量時只看關鍵字', () => {
    const ranked = rankCandidates([entry('a', ['看书'], null), entry('b', ['登山'], null)], null, ['登山'])
    expect(ranked.map((r) => [r.user_id, r.similarity])).toEqual([['b', 0.1], ['a', 0]])
  })

  it('「喜欢登山」對得上「登山」', () => {
    expect(matchesKeyword(['喜欢登山'], ['登山', '摄影'])).toBe(true)
    expect(matchesKeyword([], ['登山'])).toBe(false)
  })
})

describe('parseVector', () => {
  it('解析 pgvector 字串', () => {
    expect(parseVector('[0.5,-1]')).toEqual([0.5, -1])
    expect(parseVector(null)).toBeNull()
    expect(parseVector('oops')).toBeNull()
  })
})

describe('searchLobby', () => {
  it('排除自己與 excludeIds、篩目的、取前 limit 位並寫日誌', async () => {
    const embed = fakeEmbed([1, 0])
    setLobbySource(async () => [
      entry('me', ['登山'], [1, 0]),
      entry('x', ['登山'], [1, 0]),
      entry('y', ['登山'], [0.6, 0.8]),
      entry('z', ['读书'], [1, 0], ['study']),
      entry('w', ['登山'], [0, 1]),
    ])
    const result = await searchLobby('me', { purpose: 'sport', conditions: ['喜欢登山'], excludeIds: ['x'], limit: 1 })
    expect(result.map((r) => r.user_id)).toEqual(['y'])
    expect(embed).toHaveBeenCalledWith(expect.objectContaining({ input: '喜欢登山，运动伙伴' }))
    expect(logs[0]?.action).toBe('搜索大厅：喜欢登山 → 找到 1 位')
  })

  it('目的是交友時不篩目的', async () => {
    fakeEmbed([1, 0])
    setLobbySource(async () => [entry('z', ['读书'], [1, 0], ['study'])])
    expect(await searchLobby('me', {})).toHaveLength(1)
  })

  it('向量服務失敗時退回關鍵字排序，任務不中斷', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fakeEmbed(new Error('down'))
    setLobbySource(async () => [entry('a', ['看书'], [1, 0]), entry('b', ['登山'], [1, 0])])
    const result = await searchLobby('me', { conditions: ['登山'] })
    expect(result.map((r) => r.user_id)).toEqual(['b', 'a'])
    expect(logs[0]?.reason).toContain('关键字')
  })

  it('沒接資料庫時用 C 的種子用戶，「喜欢登山」排前面', async () => {
    const result = await searchLobby('me', { purpose: 'sport', conditions: ['喜欢登山'], limit: 3 })
    expect(result).toHaveLength(3)
    expect(result.every((r) => r.shareable.interests.some((i) => i.includes('登山')))).toBe(true)
  })
})
