// C4 聊天室後端：成員檢查、目前判定（只有我方、沒有數字）、本人發言與對方分身回覆（資料庫與 twinReply 全部用假的）。
import { describe, expect, it, vi } from 'vitest'
import type { AgentLogInput } from '../../shared/types'
import {
  ChatRoomError,
  createChatRoomApi,
  messageBodySchema,
  trendOf,
  type ChatMessageView,
  type ChatRoomStore,
  type ScoreRow,
} from '../../server/twin/chatRoom'
import type { ConversationRow } from '../../server/twin/conversation'
import type { TwinReplyFn } from '../../server/twin/twin'

const ME = 'user-me'
const AN = 'user-an'
const STRANGER = 'user-stranger'

function conv(overrides: Partial<ConversationRow> = {}): ConversationRow {
  return {
    id: 'conv-1',
    status: 'active',
    side_a: ME,
    side_b: AN,
    side_a_controller: 'twin',
    side_b_controller: 'twin',
    opening_topic: '最近爬过的山',
    task_id: 'task-1',
    round_count: 2,
    ...overrides,
  }
}

function score(perspective: string, round: number, direction: number, verdict: ScoreRow['verdict']): ScoreRow & { perspective: string } {
  return { perspective, round, direction_score: direction, verdict }
}

function harness(opts: { conv?: ConversationRow | null; scores?: (ScoreRow & { perspective: string })[]; reply?: TwinReplyFn } = {}) {
  const row = opts.conv === undefined ? conv() : opts.conv
  const messages: ChatMessageView[] = [
    { id: 'm1', conversation_id: 'conv-1', sender_id: ME, is_ai: true, guard_rewritten: false, content: '你好呀', created_at: '2026-10-30T10:00:01.000Z' },
    { id: 'm2', conversation_id: 'conv-1', sender_id: AN, is_ai: true, guard_rewritten: true, content: '你好', created_at: '2026-10-30T10:00:02.000Z' },
  ]
  const logs: AgentLogInput[] = []
  const scores = opts.scores ?? []
  const twinReply = vi.fn(
    opts.reply ??
      (async (conversationId: string, speaker: string) => {
        const m = { id: `r${messages.length + 1}`, conversation_id: conversationId, sender_id: speaker, is_ai: true, guard_rewritten: false, content: '分身回复', created_at: '2026-10-30T10:01:00.000Z' }
        messages.push(m)
        return m
      }),
  )
  const store: ChatRoomStore = {
    getConversation: async (id) => (row && row.id === id ? row : null),
    getDisplayName: async (id) => (id === AN ? '小安' : '我'),
    listMessages: async () => [...messages],
    insertHumanMessage: async (input) => {
      const m = { id: `h${messages.length + 1}`, is_ai: false as const, guard_rewritten: false, created_at: '2026-10-30T10:00:59.000Z', ...input }
      messages.push(m)
      return m
    },
    listMyScores: async (conversationId, perspective, limit) =>
      scores
        .filter((s) => s.perspective === perspective && conversationId === 'conv-1')
        .sort((x, y) => y.round - x.round)
        .slice(0, limit)
        .map(({ round, direction_score, verdict }) => ({ round, direction_score, verdict })),
  }
  const api = createChatRoomApi({ store, twinReply, writeLog: async (e) => void logs.push(e) })
  return { api, messages, logs, twinReply }
}

/** 遞迴找出物件裡所有的數字（用來確認判定沒有任何分數）。 */
function numbersIn(value: unknown): number[] {
  if (typeof value === 'number') return [value]
  if (Array.isArray(value)) return value.flatMap(numbersIn)
  if (value && typeof value === 'object') return Object.values(value).flatMap(numbersIn)
  return []
}

describe('getChatRoom', () => {
  it('回傳我方與對方是誰、由誰在聊、完整訊息（含隱私改寫標記）', async () => {
    const { api } = harness({ conv: conv({ side_a_controller: 'human' }) })
    const room = await api.getChatRoom('conv-1', ME)
    expect(room.me).toEqual({ userId: ME, controller: 'human' })
    expect(room.other).toEqual({ userId: AN, name: '小安', controller: 'twin' })
    expect(room.status).toBe('active')
    expect(room.messages.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(room.messages[1]?.guard_rewritten).toBe(true)
  })

  it('b 方打開時，我方是 b、對方是 a', async () => {
    const { api } = harness()
    const room = await api.getChatRoom('conv-1', AN)
    expect(room.me.userId).toBe(AN)
    expect(room.other.userId).toBe(ME)
  })

  it('不是這段對話的人 → 403', async () => {
    const { api } = harness()
    await expect(api.getChatRoom('conv-1', STRANGER)).rejects.toMatchObject({ status: 403 })
  })

  it('對話不存在 → 404', async () => {
    const { api } = harness({ conv: null })
    const err = await api.getChatRoom('conv-1', ME).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ChatRoomError)
    expect(err).toMatchObject({ status: 404 })
  })
})

describe('getChatStatus：目前判定', () => {
  it('還沒有判定 → verdict 為 null', async () => {
    const { api } = harness()
    const status = await api.getChatStatus('conv-1', ME)
    expect(status.verdict).toBeNull()
    expect(status).toMatchObject({ status: 'active', myController: 'twin', otherController: 'twin' })
  })

  it('只看我方視角的最新一筆，走勢和前一筆比', async () => {
    const { api } = harness({
      scores: [score(ME, 8, 55, 'uncertain'), score(ME, 12, 78, 'suitable'), score(AN, 12, 20, 'unsuitable')],
    })
    const status = await api.getChatStatus('conv-1', ME)
    expect(status.verdict).toEqual({ value: 'suitable', trend: 'up' })
  })

  it('對方打開時看到的是對方自己的視角', async () => {
    const { api } = harness({ scores: [score(ME, 8, 80, 'suitable'), score(AN, 8, 30, 'unsuitable')] })
    expect((await api.getChatStatus('conv-1', AN)).verdict).toEqual({ value: 'unsuitable', trend: 'flat' })
  })

  it('回應裡沒有任何數字（分數、輪數都不回）', async () => {
    const { api } = harness({ scores: [score(ME, 8, 60, 'uncertain'), score(ME, 12, 40, 'unsuitable'), score(AN, 12, 90, 'suitable')] })
    const status = await api.getChatStatus('conv-1', ME)
    expect(numbersIn(status)).toEqual([])
    expect(JSON.stringify(status)).not.toMatch(/score|reason|outline/)
  })

  it('不是這段對話的人 → 403', async () => {
    const { api } = harness()
    await expect(api.getChatStatus('conv-1', STRANGER)).rejects.toMatchObject({ status: 403 })
  })
})

describe('trendOf', () => {
  it('只有一筆 → 持平', () => {
    expect(trendOf([{ round: 8, direction_score: 70, verdict: 'suitable' }])).toBe('flat')
  })
  it('差距在 5 分以內 → 持平；超過 → 上升／下降', () => {
    const at = (latest: number, prev: number) =>
      trendOf([
        { round: 12, direction_score: latest, verdict: 'uncertain' },
        { round: 8, direction_score: prev, verdict: 'uncertain' },
      ])
    expect(at(64, 60)).toBe('flat')
    expect(at(55, 60)).toBe('flat')
    expect(at(66, 60)).toBe('up')
    expect(at(54, 60)).toBe('down')
  })
})

describe('sendHumanMessage', () => {
  it('我方是本人：寫入 is_ai = false，對方是分身且 active → 對方分身回覆', async () => {
    const { api, messages, twinReply } = harness({ conv: conv({ side_a_controller: 'human' }) })
    const result = await api.sendHumanMessage('conv-1', ME, '嗨，我本人来了')
    expect(result.message).toMatchObject({ sender_id: ME, is_ai: false, content: '嗨，我本人来了' })
    expect(twinReply).toHaveBeenCalledWith('conv-1', AN)
    expect(result).toMatchObject({ replied: true, replyFailed: false })
    expect(messages.at(-1)).toMatchObject({ sender_id: AN, is_ai: true })
  })

  it('我方還是分身 → 409，不寫入', async () => {
    const { api, messages, twinReply } = harness()
    await expect(api.sendHumanMessage('conv-1', ME, '你好')).rejects.toMatchObject({ status: 409 })
    expect(messages).toHaveLength(2)
    expect(twinReply).not.toHaveBeenCalled()
  })

  it('對方也是本人 → 只寫入，不叫分身', async () => {
    const { api, twinReply } = harness({ conv: conv({ side_a_controller: 'human', side_b_controller: 'human' }) })
    const result = await api.sendHumanMessage('conv-1', ME, '你好')
    expect(twinReply).not.toHaveBeenCalled()
    expect(result.replied).toBe(false)
  })

  it('對話在等本人（waiting_human）→ 寫入，但分身不回', async () => {
    const { api, twinReply } = harness({ conv: conv({ side_a_controller: 'human', status: 'waiting_human' }) })
    await api.sendHumanMessage('conv-1', ME, '你好')
    expect(twinReply).not.toHaveBeenCalled()
  })

  it('對話已結束 → 409', async () => {
    const { api } = harness({ conv: conv({ side_a_controller: 'human', status: 'ended' }) })
    await expect(api.sendHumanMessage('conv-1', ME, '你好')).rejects.toMatchObject({ status: 409 })
  })

  it('不是這段對話的人 → 403', async () => {
    const { api } = harness({ conv: conv({ side_a_controller: 'human' }) })
    await expect(api.sendHumanMessage('conv-1', STRANGER, '你好')).rejects.toMatchObject({ status: 403 })
  })

  it('對方分身回覆失敗：本人訊息照樣留著，回 replyFailed 並寫日誌', async () => {
    const { api, messages, logs } = harness({
      conv: conv({ side_a_controller: 'human' }),
      reply: async () => {
        throw new Error('LLM 超时')
      },
    })
    const result = await api.sendHumanMessage('conv-1', ME, '你好')
    expect(result).toMatchObject({ replied: false, replyFailed: true })
    expect(messages.at(-1)).toMatchObject({ sender_id: ME, is_ai: false })
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ user_id: AN, agent: 'twin', conversation_id: 'conv-1' })
  })
})

describe('messageBodySchema', () => {
  it('1–1000 字，前後空白去掉', () => {
    expect(messageBodySchema.safeParse({ text: '  你好 ' }).data).toEqual({ text: '你好' })
    expect(messageBodySchema.safeParse({ text: '   ' }).success).toBe(false)
    expect(messageBodySchema.safeParse({ text: 'a'.repeat(1000) }).success).toBe(true)
    expect(messageBodySchema.safeParse({ text: 'a'.repeat(1001) }).success).toBe(false)
    expect(messageBodySchema.safeParse({}).success).toBe(false)
  })
})
