// C9 大廳：篩選、AI 預估分級（不回數字）、卡片快取與產生（LLM mock）、「我自己聊」「讓分身去聊」的檢查。
import { describe, expect, it, vi } from 'vitest'
import type { AgentTask, ShareableProfile } from '../../shared/types'
import { ChatRoomError } from '../../server/twin/chatRoom'
import {
  NOT_READY_FOR_TWIN,
  createLobbyApi,
  fitLevel,
  keepProfileTags,
  lobbyQuerySchema,
  matchesFilter,
  type LobbyDeps,
  type LobbyMe,
  type LobbyRow,
} from '../../server/twin/lobby'
import { lobbyCardSchema } from '../../server/prompts/10_card'
import { parseVector } from '../../server/twin/lobbyStore'

const ME = '11111111-1111-4111-8111-111111111111'
const AN = '22222222-2222-4222-8222-222222222222'
const ZHE = '33333333-3333-4333-8333-333333333333'
const XIA = '44444444-4444-4444-8444-444444444444'

function profile(intro: string, interests: string[]): ShareableProfile {
  return { intro, interests, chat_style: '慢热、短句', looking_for: '一起爬山的朋友' }
}

const CACHED = { headline: '慢热的登山爱好者', tags: ['登山', '摄影'], chat_style: '慢热、短句', mbti: null }

function rows(): LobbyRow[] {
  return [
    { user_id: ME, display_name: '我', purposes: ['sport'], shareable: profile('我', ['登山']), card: CACHED, embedding: [1, 0], self_mbti: null },
    // 和我方向一樣 → 很可能合得來；有快取卡片
    { user_id: AN, display_name: '小安', purposes: ['sport', 'friend'], shareable: profile('慢热的登山爱好者', ['登山', '摄影', '看展']), card: CACHED, embedding: [1, 0], self_mbti: 'INFP' },
    // cos = 0.6 → 可以聊聊看；沒有卡片要產生
    { user_id: ZHE, display_name: '阿哲', purposes: ['sport'], shareable: profile('越野跑和登山都爱', ['登山', '越野跑', '重训']), card: null, embedding: [0.6, 0.8], self_mbti: null },
    // 垂直 → 差異較大；不是運動
    { user_id: XIA, display_name: '夏夏', purposes: ['hobby', 'friend'], shareable: profile('爱画画的动漫迷', ['动漫', '漫展', '绘图']), card: null, embedding: [0, 1], self_mbti: null },
  ]
}

function deps(opts: { me?: Partial<LobbyMe>; llm?: LobbyDeps['llmJson']; open?: string | null } = {}) {
  const me: LobbyMe = { socialAgentEnabled: true, shareableConfirmed: true, embedding: [1, 0], ...opts.me }
  const d = {
    store: {
      listLobbyUsers: vi.fn(async () => rows()),
      getMe: vi.fn(async () => me),
      saveCard: vi.fn(async () => undefined),
      findOpenManualChat: vi.fn(async () => opts.open ?? null),
    },
    llmJson: vi.fn(
      opts.llm ??
        (async (o) => o.schema.parse({ headline: '新卡片', tags: ['登山', '跳伞'], chat_style: '节奏快、话多', mbti: null })),
    ) as LobbyDeps['llmJson'],
    startConversation: vi.fn(async () => ({ conversationId: 'conv-new' })),
    createSingleTargetTask: vi.fn(async () => ({ id: 'task-1' }) as AgentTask),
  }
  return d
}

describe('fitLevel：相似度分三級', () => {
  it('0.65 以上很可能合得來、0.55 以上可以聊聊看、其他差異較大', () => {
    expect(fitLevel(0.92)).toBe('likely')
    expect(fitLevel(0.65)).toBe('likely')
    expect(fitLevel(0.6)).toBe('maybe')
    expect(fitLevel(0.55)).toBe('maybe')
    expect(fitLevel(0.44)).toBe('different')
  })
})

describe('篩選', () => {
  it('目的要在對方的目的裡、關鍵字雙向比對興趣', () => {
    const [, an, zhe, xia] = rows()
    expect(matchesFilter(an!, { purpose: 'sport', q: '登山' })).toBe(true)
    expect(matchesFilter(xia!, { purpose: 'sport' })).toBe(false)
    expect(matchesFilter(zhe!, { q: '爱登山' })).toBe(true)
    expect(matchesFilter(xia!, { q: '登山' })).toBe(false)
    expect(matchesFilter(xia!, {})).toBe(true)
  })

  it('查詢參數：空字串當作沒篩選；目的不合法、關鍵字太長都不通過', () => {
    expect(lobbyQuerySchema.parse({ purpose: '', q: '  ' })).toEqual({ purpose: undefined, q: undefined })
    expect(lobbyQuerySchema.safeParse({ purpose: 'dating' }).success).toBe(false)
    expect(lobbyQuerySchema.safeParse({ q: '登'.repeat(31) }).success).toBe(false)
  })
})

describe('listLobby', () => {
  it('不含自己、照相似度排序，AI 預估只有文字等級，沒有任何數字或向量', async () => {
    const api = createLobbyApi(deps())
    const cards = await api.listLobby(ME, {})
    expect(cards.map((c) => [c.name, c.fit])).toEqual([
      ['小安', 'likely'],
      ['阿哲', 'maybe'],
      ['夏夏', 'different'],
    ])
    const json = JSON.stringify(cards)
    expect(json).not.toMatch(/similarity|embedding|score|big_five|looking_for/)
    expect(json).not.toMatch(/0\.\d/)
  })

  it('篩選運動＋登山只剩運動且喜歡登山的人', async () => {
    const cards = await createLobbyApi(deps()).listLobby(ME, { purpose: 'sport', q: '登山' })
    expect(cards.map((c) => c.name)).toEqual(['小安', '阿哲'])
  })

  it('有快取就不呼叫 LLM；沒有卡片的用 Prompt 10 產生並快取，標籤只留檔案裡有的興趣', async () => {
    const d = deps()
    const cards = await createLobbyApi(d).listLobby(ME, { purpose: 'sport' })
    expect(cards.find((c) => c.name === '小安')).toMatchObject({ headline: '慢热的登山爱好者', mbti: 'INFP' })
    expect(d.llmJson).toHaveBeenCalledTimes(1)
    expect(d.llmJson).toHaveBeenCalledWith(expect.objectContaining({ role: 'fast', temperature: 0.3 }))
    const zhe = cards.find((c) => c.name === '阿哲')!
    expect(zhe).toMatchObject({ headline: '新卡片', chatStyle: '节奏快、话多', tags: ['登山'] })
    expect(d.store.saveCard).toHaveBeenCalledWith(ZHE, { headline: '新卡片', tags: ['登山'], chat_style: '节奏快、话多', mbti: null })
  })

  it('Prompt 10 的輸入只有對外檔案與自填 MBTI，放在標籤裡', async () => {
    const d = deps()
    await createLobbyApi(d).listLobby(ME, { q: '越野' })
    const call = vi.mocked(d.llmJson).mock.calls[0]![0]
    expect(call.system).toContain('用简体中文回复')
    expect(call.messages[0]!.content).toContain('<profile>')
    expect(call.messages[0]!.content).toContain('越野跑')
  })

  it('LLM 失敗時用對外檔案當備用卡片，不快取、大廳照樣打得開', async () => {
    const d = deps({
      llm: async () => {
        throw new Error('timeout')
      },
    })
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const cards = await createLobbyApi(d).listLobby(ME, { q: '动漫' })
    err.mockRestore()
    expect(cards).toEqual([
      expect.objectContaining({ name: '夏夏', headline: '爱画画的动漫迷', tags: ['动漫', '漫展', '绘图'], chatStyle: '慢热、短句' }),
    ])
    expect(d.store.saveCard).not.toHaveBeenCalled()
  })

  it('快取存不進去也照樣顯示產生的卡片', async () => {
    const d = deps()
    d.store.saveCard.mockRejectedValue(new Error('db down'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const cards = await createLobbyApi(d).listLobby(ME, { q: '越野' })
    err.mockRestore()
    expect(cards[0]).toMatchObject({ headline: '新卡片' })
  })

  it('我還沒有向量（檔案沒確認）時 AI 預估是 null', async () => {
    const cards = await createLobbyApi(deps({ me: { embedding: null } })).listLobby(ME, {})
    expect(cards.every((c) => c.fit === null)).toBe(true)
  })
})

describe('卡片格式', () => {
  it('稍微超過不切（避免切在句子中間）、明顯過長才截斷；標籤最多 5 個、亂填的 MBTI 變 null', () => {
    const slight = lobbyCardSchema.parse({ headline: '一'.repeat(22), tags: [], chat_style: '慢热，熟了会分享很多照片和小发现', mbti: null })
    expect(slight.chat_style).toBe('慢热，熟了会分享很多照片和小发现')
    expect(slight.headline).toHaveLength(22)
    const card = lobbyCardSchema.parse({ headline: '一'.repeat(50), tags: ['a', 'b', 'c', 'd', 'e', 'f'], chat_style: '二'.repeat(40), mbti: '猜的' })
    expect(card.headline).toHaveLength(30)
    expect(card.tags).toHaveLength(5)
    expect(card.chat_style).toHaveLength(24)
    expect(card.mbti).toBeNull()
  })

  it('標籤一個都沒對上檔案就改用檔案的興趣', () => {
    const p = profile('x', ['登山', '摄影'])
    expect(keepProfileTags({ headline: 'x', tags: ['跳伞'], chat_style: '', mbti: null }, p).tags).toEqual(['登山', '摄影'])
  })

  it('pgvector 字串解析成數字陣列', () => {
    expect(parseVector('[0.5,-1]')).toEqual([0.5, -1])
    expect(parseVector(null)).toBeNull()
    expect(parseVector('oops')).toBeNull()
  })
})

describe('我自己聊', () => {
  it('建立我本人 ↔ 對方分身的手動對話', async () => {
    const d = deps()
    expect(await createLobbyApi(d).startHumanChat(ME, AN)).toEqual({ conversationId: 'conv-new' })
    expect(d.startConversation).toHaveBeenCalledWith({ aUserId: ME, bUserId: AN, aController: 'human', origin: 'manual' })
  })

  it('已經有還沒結束的手動對話就接著聊，不重開', async () => {
    const d = deps({ open: 'conv-old' })
    expect(await createLobbyApi(d).startHumanChat(ME, AN)).toEqual({ conversationId: 'conv-old' })
    expect(d.startConversation).not.toHaveBeenCalled()
  })

  it('對方不在大廳 → 404；找自己 → 400', async () => {
    const api = createLobbyApi(deps())
    await expect(api.startHumanChat(ME, '55555555-5555-4555-8555-555555555555')).rejects.toMatchObject({ status: 404 })
    await expect(api.startHumanChat(ME, ME)).rejects.toMatchObject({ status: 400 })
  })
})

describe('讓分身去聊', () => {
  it('呼叫 B 的 createSingleTargetTask，回傳任務 id', async () => {
    const d = deps()
    expect(await createLobbyApi(d).startTwinChat(ME, ZHE)).toEqual({ taskId: 'task-1' })
    expect(d.createSingleTargetTask).toHaveBeenCalledWith(ME, ZHE)
  })

  it('沒開社交 Agent 或檔案沒確認 → 403，不建任務', async () => {
    for (const me of [{ socialAgentEnabled: false }, { shareableConfirmed: false }]) {
      const d = deps({ me })
      const err = await createLobbyApi(d).startTwinChat(ME, ZHE).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(ChatRoomError)
      expect(err).toMatchObject({ status: 403, message: NOT_READY_FOR_TWIN })
      expect(d.createSingleTargetTask).not.toHaveBeenCalled()
    }
  })
})
