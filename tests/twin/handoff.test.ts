// C6 本人接手：只有對話成員、我方是分身才能接手；Prompt 7 只拿我方視角的判定；改成本人、寫入 handoffs、寫日誌；
// LLM 或 handoffs 寫入失敗時照常接手（資料庫與 LLM 全部用假的）。
import { describe, expect, it, vi } from 'vitest'
import type { AgentLogInput } from '../../shared/types'
import type { LlmJsonOptions } from '../../server/lib/llm'
import { ChatRoomError, type ChatMessageView, type ScoreRow } from '../../server/twin/chatRoom'
import type { ConversationRow } from '../../server/twin/conversation'
import {
  createHandoffApi,
  formatHandoffTranscript,
  HANDOFF_TRANSCRIPT_LIMIT,
  lastSpeakerNote,
  myVerdictText,
  takeoverBlock,
  type HandoffStore,
  type NewHandoff,
  type Side,
} from '../../server/twin/handoff'
import { handoffSummarySchema, HANDOFF_ITEM_CHARS } from '../../server/prompts/07_handoff'

const ME = 'user-me'
const AN = 'user-an'
const STRANGER = 'user-stranger'

function conv(overrides: Partial<ConversationRow> = {}): ConversationRow {
  return {
    id: 'conv-1',
    status: 'waiting_human',
    side_a: ME,
    side_b: AN,
    side_a_controller: 'twin',
    side_b_controller: 'twin',
    opening_topic: '最近爬过的山',
    task_id: 'task-1',
    round_count: 4,
    ...overrides,
  }
}

function msg(i: number, sender: string, isAi = true): ChatMessageView {
  const sec = String(i).padStart(2, '0')
  return { id: `m${i}`, conversation_id: 'conv-1', sender_id: sender, is_ai: isAi, guard_rewritten: false, content: `第${i}则`, created_at: `2026-10-30T10:00:${sec}.000Z` }
}

const SUMMARY = {
  key_points: ['聊了最近爬过的山'],
  other_highlights: ['喜欢拍日出'],
  twin_said: ['分身已经替你说过：喜欢慢慢走'],
  open_topics: ['下次想去哪座山'],
  suggested_replies: ['我本人来啦，你最近拍到日出了吗？'],
}

interface Harness {
  conv?: ConversationRow | null
  scores?: (ScoreRow & { perspective: string })[]
  llm?: (opts: LlmJsonOptions<unknown>) => Promise<unknown>
  switched?: boolean
  insertFails?: boolean
}

function harness(opts: Harness = {}) {
  const row = opts.conv === undefined ? conv() : opts.conv
  const messages = [msg(1, ME), msg(2, AN), msg(3, ME), msg(4, AN)]
  const scores = opts.scores ?? [
    { perspective: ME, round: 4, direction_score: 80, verdict: 'suitable' as const },
    { perspective: ME, round: 3, direction_score: 60, verdict: 'uncertain' as const },
    { perspective: AN, round: 4, direction_score: 20, verdict: 'unsuitable' as const },
  ]
  const logs: AgentLogInput[] = []
  const handoffs: NewHandoff[] = []
  const switches: { id: string; side: Side }[] = []
  const store: HandoffStore = {
    getConversation: async (id) => (row && row.id === id ? { ...row } : null),
    listMessages: async () => [...messages],
    listMyScores: vi.fn(async (_c: string, perspective: string, limit: number) =>
      scores.filter((s) => s.perspective === perspective).slice(0, limit),
    ),
    switchToHuman: vi.fn(async (id: string, side: Side) => {
      switches.push({ id, side })
      return opts.switched ?? true
    }),
    insertHandoff: vi.fn(async (h: NewHandoff) => {
      if (opts.insertFails) throw new Error('db down')
      handoffs.push(h)
    }),
  }
  const llmJson = vi.fn(opts.llm ?? (async () => SUMMARY))
  const api = createHandoffApi({
    store,
    llmJson: llmJson as unknown as <T>(o: LlmJsonOptions<T>) => Promise<T>,
    writeLog: async (e) => {
      logs.push(e)
    },
  })
  return { api, store, llmJson, logs, handoffs, switches }
}

async function expectError(p: Promise<unknown>, status: number, text?: string) {
  const err = await p.catch((e: unknown) => e)
  expect(err).toBeInstanceOf(ChatRoomError)
  expect((err as ChatRoomError).status).toBe(status)
  if (text) expect((err as ChatRoomError).message).toBe(text)
}

describe('takeOver 檢查', () => {
  it('不是對話成員 → 403，不呼叫 LLM、不改資料', async () => {
    const h = harness()
    await expectError(h.api.takeOver('conv-1', STRANGER), 403)
    expect(h.llmJson).not.toHaveBeenCalled()
    expect(h.store.switchToHuman).not.toHaveBeenCalled()
  })

  it('找不到對話 → 404', async () => {
    await expectError(harness({ conv: null }).api.takeOver('conv-1', ME), 404)
  })

  it('我方已經是本人 → 409（接手後不再交回，也不能再接手一次）', async () => {
    const h = harness({ conv: conv({ side_a_controller: 'human', status: 'active' }) })
    await expectError(h.api.takeOver('conv-1', ME), 409, '你已经本人接手了，直接在聊天室里聊吧')
    expect(h.llmJson).not.toHaveBeenCalled()
  })

  it('對話已結束 → 409', async () => {
    await expectError(harness({ conv: conv({ status: 'ended' }) }).api.takeOver('conv-1', ME), 409, '这段对话已经结束了')
  })

  it('條件更新沒改到（同時被結束或接手）→ 409，不寫 handoffs', async () => {
    const h = harness({ switched: false })
    await expectError(h.api.takeOver('conv-1', ME), 409)
    expect(h.handoffs).toEqual([])
    expect(h.logs).toEqual([])
  })

  it('同一人同時按兩次 → 第二次 409，LLM 只跑一次', async () => {
    let release: (v: unknown) => void = () => {}
    const h = harness({ llm: () => new Promise((r) => (release = r)) })
    const first = h.api.takeOver('conv-1', ME)
    await vi.waitFor(() => expect(h.llmJson).toHaveBeenCalledTimes(1))
    await expectError(h.api.takeOver('conv-1', ME), 409, '正在整理接手卡片，稍等一下')
    release(SUMMARY)
    await first
    expect(h.llmJson).toHaveBeenCalledTimes(1)
  })
})

describe('takeOver 成功', () => {
  it('a 方接手：改成本人、寫入 handoffs、寫日誌，回傳卡片與我方判定', async () => {
    const h = harness()
    const out = await h.api.takeOver('conv-1', ME)
    expect(out).toEqual({
      conversationId: 'conv-1',
      verdict: { value: 'suitable', trend: 'up' },
      summary: SUMMARY,
      summaryFailed: false,
    })
    expect(h.switches).toEqual([{ id: 'conv-1', side: 'a' }])
    expect(h.handoffs).toEqual([{ conversation_id: 'conv-1', user_id: ME, summary: SUMMARY }])
    expect(h.logs).toEqual([
      expect.objectContaining({ user_id: ME, agent: 'twin', conversation_id: 'conv-1', task_id: 'task-1', action: '本人接手，分身停止代聊' }),
    ])
    expect(h.logs[0]).not.toHaveProperty('detail')
  })

  it('b 方接手：改的是 b 方', async () => {
    const h = harness({
      scores: [{ perspective: AN, round: 4, direction_score: 50, verdict: 'uncertain' }],
    })
    const out = await h.api.takeOver('conv-1', AN)
    expect(h.switches).toEqual([{ id: 'conv-1', side: 'b' }])
    expect(out.verdict).toEqual({ value: 'uncertain', trend: 'flat' })
  })

  it('Prompt 7 只拿我方視角：只讀自己的判定，prompt 裡沒有對方的判定與分數', async () => {
    const h = harness()
    await h.api.takeOver('conv-1', ME)
    expect(h.store.listMyScores).toHaveBeenCalledTimes(1)
    expect(h.store.listMyScores).toHaveBeenCalledWith('conv-1', ME, 2)
    const opts = h.llmJson.mock.calls[0][0]
    expect(opts.role).toBe('fast')
    expect(opts.temperature).toBe(0.3)
    expect(opts.system).toContain('合适，走势上升')
    const all = opts.system + opts.messages.map((m) => m.content).join('\n')
    expect(all).not.toMatch(/不太合适|80|20/)
    expect(opts.messages[0].content).toContain('你的分身：第1则')
    expect(opts.messages[0].content).toContain('对方的分身：第2则')
    // 最後一則是對方說的
    expect(opts.messages[0].content).toContain('最后一则是「对方的分身」说的，轮到你回应。')
  })

  it('LLM 失敗 → 照常接手，卡片空白、summaryFailed，錯誤寫進日誌 detail', async () => {
    const h = harness({ llm: async () => Promise.reject(new Error('timeout')) })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const out = await h.api.takeOver('conv-1', ME)
    spy.mockRestore()
    expect(out.summaryFailed).toBe(true)
    expect(out.summary.twin_said).toEqual([])
    expect(h.switches).toHaveLength(1)
    expect(h.handoffs).toHaveLength(1)
    expect(h.logs[0].detail).toEqual({ summary_error: 'timeout' })
  })

  it('handoffs 寫入失敗 → 仍然回傳卡片（已經改成本人），錯誤寫進日誌 detail', async () => {
    const h = harness({ insertFails: true })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const out = await h.api.takeOver('conv-1', ME)
    spy.mockRestore()
    expect(out.summary).toEqual(SUMMARY)
    expect(h.logs[0].detail).toEqual({ handoff_error: 'db down' })
  })
})

describe('純函式', () => {
  it('takeoverBlock：結束、已接手才擋；waiting_human 與 active 都能接手', () => {
    const me = { userId: ME, controller: 'twin' as const }
    expect(takeoverBlock(conv({ status: 'waiting_human' }), me)).toBeNull()
    expect(takeoverBlock(conv({ status: 'active' }), me)).toBeNull()
    expect(takeoverBlock(conv({ status: 'ended' }), me)).toBe('这段对话已经结束了')
    expect(takeoverBlock(conv(), { ...me, controller: 'human' })).not.toBeNull()
  })

  it('myVerdictText：沒有判定時說還沒有判定', () => {
    expect(myVerdictText(null)).toBe('还没有判定')
    expect(myVerdictText({ value: 'unsuitable', trend: 'down' })).toBe('不太合适，走势下降')
  })

  it('formatHandoffTranscript：四種說話者，只取最近幾則', () => {
    const text = formatHandoffTranscript([msg(1, ME), msg(2, AN), msg(3, ME, false), msg(4, AN, false)], ME)
    expect(text).toBe('你的分身：第1则\n对方的分身：第2则\n你本人：第3则\n对方本人：第4则')
    expect(formatHandoffTranscript([], ME)).toBe('（还没有消息）')
    const many = Array.from({ length: HANDOFF_TRANSCRIPT_LIMIT + 5 }, (_, i) => msg(i + 1, ME))
    const lines = formatHandoffTranscript(many, ME).split('\n')
    expect(lines).toHaveLength(HANDOFF_TRANSCRIPT_LIMIT)
    expect(lines[0]).toBe('你的分身：第6则')
  })

  it('lastSpeakerNote：最後是我方說的要提醒對方還沒回；沒有訊息時寫開場白', () => {
    const mine = lastSpeakerNote([msg(1, AN), msg(2, ME)], ME)
    expect(mine).toContain('最后一则是「你的分身」说的：「第2则」对方还没回。')
    expect(mine).toContain('不要回答')
    expect(lastSpeakerNote([msg(1, ME), msg(2, AN, false)], ME)).toBe('最后一则是「对方本人」说的，轮到你回应。')
    expect(lastSpeakerNote([], ME)).toContain('开场白')
  })

  it('handoffSummarySchema：每項最多 3 點、每點截斷到 25 字，缺欄位或格式錯當成空的', () => {
    const long = '一'.repeat(40)
    const parsed = handoffSummarySchema.parse({
      key_points: ['a', 'b', 'c', 'd'],
      other_highlights: [long],
      twin_said: 'not-array',
      open_topics: [' ', 'x'],
    })
    expect(parsed.key_points).toEqual(['a', 'b', 'c'])
    expect(parsed.other_highlights[0]).toHaveLength(HANDOFF_ITEM_CHARS)
    expect(parsed.twin_said).toEqual([])
    expect(parsed.open_topics).toEqual(['x'])
    expect(parsed.suggested_replies).toEqual([])
  })
})
