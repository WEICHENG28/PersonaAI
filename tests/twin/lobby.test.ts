// C9 大廳：候選人來自 B 的 searchLobby（用我的興趣＋想找當查詢）、篩選、AI 預估分級（不回數字）、
// 卡片快取與產生（LLM mock）、「我自己聊」「讓分身去聊」的檢查。
import { describe, expect, it, vi } from 'vitest'
import type { AgentTask, LobbyCandidate, ShareableProfile } from '../../shared/types'
import { ChatRoomError } from '../../server/twin/chatRoom'
import {
  NOT_READY_FOR_TWIN,
  createLobbyApi,
  fitLevel,
  keepProfileTags,
  lobbyQuerySchema,
  matchesFilter,
  myQueryText,
  type CardRow,
  type LobbyDeps,
} from '../../server/twin/lobby'
import { lobbyCardSchema } from '../../server/prompts/10_card'

const ME = '11111111-1111-4111-8111-111111111111'
const AN = '22222222-2222-4222-8222-222222222222'
const ZHE = '33333333-3333-4333-8333-333333333333'
const XIA = '44444444-4444-4444-8444-444444444444'

function profile(intro: string, interests: string[]): ShareableProfile {
  return { intro, interests, chat_style: '慢热、短句', looking_for: '一起爬山的朋友' }
}

const MY_PROFILE = profile('周末爬山', ['登山', '摄影'])
const CACHED = { headline: '慢热的登山爱好者', tags: ['登山', '摄影'], chat_style: '慢热、短句', mbti: null }

// searchLobby 已經照相似度排好（B 的排序）
const FOUND: LobbyCandidate[] = [
  { user_id: AN, display_name: '小安', shareable: profile('慢热的登山爱好者', ['登山', '摄影', '看展']), similarity: 0.72 },
  { user_id: ZHE, display_name: '阿哲', shareable: profile('越野跑和登山都爱', ['登山', '越野跑', '重训']), similarity: 0.55 },
  { user_id: XIA, display_name: '夏夏', shareable: profile('爱画画的动漫迷', ['动漫', '漫展', '绘图']), similarity: 0.44 },
]

function rows(): Map<string, CardRow> {
  return new Map<string, CardRow>([
    [AN, { card: CACHED, self_mbti: 'INFP', purposes: ['sport', 'friend'] }],
    [ZHE, { card: null, self_mbti: null, purposes: ['sport'] }],
    [XIA, { card: null, self_mbti: null, purposes: ['hobby', 'friend'] }],
  ])
}

function deps(opts: { me?: ShareableProfile | null; ready?: boolean; inLobby?: boolean; llm?: LobbyDeps['llmJson']; open?: string | null } = {}) {
  return {
    store: {
      getCardRows: vi.fn(async () => rows()),
      saveCard: vi.fn(async () => undefined),
      isReadyForTwin: vi.fn(async () => opts.ready ?? true),
      isInLobby: vi.fn(async () => opts.inLobby ?? true),
      findOpenManualChat: vi.fn(async () => opts.open ?? null),
    },
    searchLobby: vi.fn(async () => FOUND),
    getShareableProfile: vi.fn(async () => (opts.me === undefined ? MY_PROFILE : opts.me)),
    createTaskFromText: vi.fn(async () => ({ id: 'task-search' }) as AgentTask),
    createSingleTargetTask: vi.fn(async () => ({ id: 'task-1' }) as AgentTask),
    startConversation: vi.fn(async () => ({ conversationId: 'conv-new' })),
    llmJson: vi.fn(
      opts.llm ??
        (async (o) => o.schema.parse({ headline: '新卡片', tags: ['登山', '跳伞'], chat_style: '节奏快、话多', mbti: null })),
    ) as LobbyDeps['llmJson'],
  }
}

describe('fitLevel：相似度分三級', () => {
  it('0.6 以上很可能合得來、0.5 以上可以聊聊看、其他差異較大', () => {
    expect(fitLevel(0.82)).toBe('likely')
    expect(fitLevel(0.6)).toBe('likely')
    expect(fitLevel(0.55)).toBe('maybe')
    expect(fitLevel(0.5)).toBe('maybe')
    expect(fitLevel(0.44)).toBe('different')
  })
})

describe('篩選', () => {
  it('目的照字面比對、關鍵字雙向比對興趣', () => {
    const [an, zhe, xia] = FOUND
    expect(matchesFilter(['sport'], an!.shareable, { purpose: 'sport', q: '登山' })).toBe(true)
    expect(matchesFilter(['hobby', 'friend'], xia!.shareable, { purpose: 'sport' })).toBe(false)
    expect(matchesFilter(['sport'], zhe!.shareable, { q: '爱登山' })).toBe(true)
    expect(matchesFilter(undefined, xia!.shareable, { q: '登山' })).toBe(false)
    expect(matchesFilter(undefined, xia!.shareable, {})).toBe(true)
  })

  it('查詢參數：空字串當作沒篩選；目的不合法、關鍵字太長都不通過', () => {
    expect(lobbyQuerySchema.parse({ purpose: '', q: '  ' })).toEqual({ purpose: undefined, q: undefined })
    expect(lobbyQuerySchema.safeParse({ purpose: 'dating' }).success).toBe(false)
    expect(lobbyQuerySchema.safeParse({ q: '登'.repeat(31) }).success).toBe(false)
  })
})

describe('listLobby', () => {
  it('用我的興趣＋想找的人呼叫 searchLobby（不帶關鍵字加分），照 B 的排序，AI 預估只有文字等級', async () => {
    const d = deps()
    const cards = await createLobbyApi(d).listLobby(ME, {})
    expect(d.searchLobby).toHaveBeenCalledWith(ME, { text: myQueryText(MY_PROFILE), limit: 100 })
    expect(myQueryText(MY_PROFILE)).toBe('兴趣：登山、摄影；想找：一起爬山的朋友')
    expect(cards.map((c) => [c.name, c.fit])).toEqual([
      ['小安', 'likely'],
      ['阿哲', 'maybe'],
      ['夏夏', 'different'],
    ])
    const json = JSON.stringify(cards)
    expect(json).not.toMatch(/similarity|embedding|score|big_five|looking_for/)
    expect(json).not.toMatch(/0\.\d/)
  })

  it('篩選運動＋登山：searchLobby 不會刷掉人，由大廳自己篩', async () => {
    const cards = await createLobbyApi(deps()).listLobby(ME, { purpose: 'sport', q: '登山' })
    expect(cards.map((c) => c.name)).toEqual(['小安', '阿哲'])
  })

  it('我還沒確認對外檔案時不放預估（相似度不是「跟我合不合」）', async () => {
    const d = deps({ me: null })
    const cards = await createLobbyApi(d).listLobby(ME, {})
    expect(d.searchLobby).toHaveBeenCalledWith(ME, { text: undefined, limit: 100 })
    expect(cards.every((c) => c.fit === null)).toBe(true)
  })

  it('有快取就不呼叫 LLM；沒有卡片的用 Prompt 10 產生並快取，標籤只留檔案裡有的興趣', async () => {
    const d = deps()
    const cards = await createLobbyApi(d).listLobby(ME, { purpose: 'sport' })
    expect(cards.find((c) => c.name === '小安')).toMatchObject({ headline: '慢热的登山爱好者', mbti: 'INFP' })
    expect(d.llmJson).toHaveBeenCalledTimes(1)
    expect(d.llmJson).toHaveBeenCalledWith(expect.objectContaining({ role: 'fast', temperature: 0.3 }))
    expect(cards.find((c) => c.name === '阿哲')).toMatchObject({ headline: '新卡片', chatStyle: '节奏快、话多', tags: ['登山'] })
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
    const d = deps({ llm: async () => Promise.reject(new Error('timeout')) })
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const cards = await createLobbyApi(d).listLobby(ME, { q: '动漫' })
    err.mockRestore()
    expect(cards).toEqual([expect.objectContaining({ name: '夏夏', headline: '爱画画的动漫迷', tags: ['动漫', '漫展', '绘图'], chatStyle: '慢热、短句' })])
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
    await expect(createLobbyApi(deps({ inLobby: false })).startHumanChat(ME, AN)).rejects.toMatchObject({ status: 404 })
    await expect(createLobbyApi(deps()).startHumanChat(ME, ME)).rejects.toMatchObject({ status: 400 })
  })
})

describe('讓分身去聊', () => {
  it('呼叫 B 的 createSingleTargetTask，回傳任務 id', async () => {
    const d = deps()
    expect(await createLobbyApi(d).startTwinChat(ME, ZHE)).toEqual({ taskId: 'task-1' })
    expect(d.createSingleTargetTask).toHaveBeenCalledWith(ME, ZHE)
  })

  it('沒開社交 Agent 或檔案沒確認 → 403，不建任務', async () => {
    const d = deps({ ready: false })
    const err = await createLobbyApi(d).startTwinChat(ME, ZHE).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ChatRoomError)
    expect(err).toMatchObject({ status: 403, message: NOT_READY_FOR_TWIN })
    expect(d.createSingleTargetTask).not.toHaveBeenCalled()
  })

  it('B 的 TaskError 原樣回給用戶（狀態碼照帶）', async () => {
    const d = deps()
    d.createSingleTargetTask.mockRejectedValue(Object.assign(new Error('找不到这个人'), { name: 'TaskError', status: 404 }))
    await expect(createLobbyApi(d).startTwinChat(ME, ZHE)).rejects.toMatchObject({ name: 'ChatRoomError', status: 404, message: '找不到这个人' })
  })
})

import { matchesName } from '../../server/twin/lobby'

describe('matchesName：用名字（ID）找人', () => {
  it('包含就算、不分大小寫；沒填就全部', () => {
    expect(matchesName('爱喝咖啡的橘猫', '橘猫')).toBe(true)
    expect(matchesName('C-Test4', 'test')).toBe(true)
    expect(matchesName('夏夏', '小林')).toBe(false)
    expect(matchesName('夏夏', undefined)).toBe(true)
  })
})
