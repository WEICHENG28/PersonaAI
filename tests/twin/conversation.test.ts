// C3 代聊函式：開始、跑輪數、對話紀錄、結束、等待本人（資料庫與 twinReply 全部用假的）。
import { describe, expect, it, vi } from 'vitest'
import type { AgentLogInput, ChatMessage, Controller } from '../../shared/types'
import { CONFIG } from '../../server/lib/config'
import {
  CLOSING_INSTRUCTION,
  createConversationApi,
  type ConversationDeps,
  type ConversationRow,
  type ConversationStore,
} from '../../server/twin/conversation'
import { TwinError, type TwinReplyFn } from '../../server/twin/twin'

const AN = 'user-an'
const ZHE = 'user-zhe'

interface Harness {
  api: ReturnType<typeof createConversationApi>
  rows: Map<string, ConversationRow>
  messages: ChatMessage[]
  logs: AgentLogInput[]
  twinReply: ReturnType<typeof vi.fn>
}

function row(overrides: Partial<ConversationRow> = {}): ConversationRow {
  return {
    id: 'conv-1',
    status: 'active',
    side_a: AN,
    side_b: ZHE,
    side_a_controller: 'twin',
    side_b_controller: 'twin',
    opening_topic: '最近爬过的山',
    task_id: 'task-1',
    round_count: 0,
    ...overrides,
  }
}

/** 假的資料庫＋假的 twinReply（每次呼叫就新增一則訊息）。 */
function harness(opts: { conv?: ConversationRow; messages?: ChatMessage[]; reply?: TwinReplyFn } = {}): Harness {
  const rows = new Map<string, ConversationRow>()
  if (opts.conv) rows.set(opts.conv.id, opts.conv)
  const messages: ChatMessage[] = [...(opts.messages ?? [])]
  const logs: AgentLogInput[] = []
  let seq = messages.length

  const defaultReply: TwinReplyFn = async (conversationId, speakerUserId) => {
    seq += 1
    const msg: ChatMessage = {
      id: `m${seq}`,
      conversation_id: conversationId,
      sender_id: speakerUserId,
      is_ai: true,
      content: `第${seq}则`,
      created_at: new Date(Date.UTC(2026, 9, 30, 10, 0, seq)).toISOString(),
    }
    messages.push(msg)
    return msg
  }
  const twinReply = vi.fn(opts.reply ?? defaultReply)

  const store: ConversationStore = {
    async createConversation(input) {
      const created: ConversationRow = { id: `conv-new-${rows.size + 1}`, status: 'active', round_count: 0, ...input }
      rows.set(created.id, created)
      return created
    },
    getConversation: async (id) => rows.get(id) ?? null,
    async updateConversation(id, patch) {
      const current = rows.get(id)
      if (current) rows.set(id, { ...current, ...patch })
    },
    getLastSenderId: async (id) => messages.filter((m) => m.conversation_id === id).at(-1)?.sender_id ?? null,
    listMessages: async (id) => messages.filter((m) => m.conversation_id === id),
  }
  const deps: ConversationDeps = {
    store,
    twinReply: twinReply as unknown as TwinReplyFn,
    writeLog: async (entry) => {
      logs.push(entry)
    },
    now: () => new Date('2026-10-30T12:00:00Z'),
    maxRounds: CONFIG.MAX_ROUNDS,
  }
  return { api: createConversationApi(deps), rows, messages, logs, twinReply }
}

const speakers = (h: Harness) => h.twinReply.mock.calls.map((c) => c[1])

describe('startConversation', () => {
  const input = { aUserId: AN, bUserId: ZHE, origin: 'auto' as const, taskId: 'task-1', openingTopic: '登山' }

  it('a 方是分身：建立對話（b 方一律 twin），a 方立刻送出開場，寫日誌「开始代聊」', async () => {
    const h = harness()
    const { conversationId } = await h.api.startConversation({ ...input, aController: 'twin' })

    expect(h.rows.get(conversationId)).toMatchObject({
      side_a: AN,
      side_b: ZHE,
      side_a_controller: 'twin',
      side_b_controller: 'twin',
      status: 'active',
      origin: 'auto',
      task_id: 'task-1',
      opening_topic: '登山',
      round_count: 0,
    })
    expect(h.twinReply).toHaveBeenCalledTimes(1)
    expect(h.twinReply).toHaveBeenCalledWith(conversationId, AN)
    expect(h.logs).toContainEqual(
      expect.objectContaining({ user_id: AN, agent: 'twin', action: '开始代聊', conversation_id: conversationId, task_id: 'task-1' }),
    )
    expect(h.logs.at(-1)?.reason).toContain('登山')
  })

  it('a 方是本人：不送開場，b 方仍是分身', async () => {
    const h = harness()
    const { conversationId } = await h.api.startConversation({ ...input, aController: 'human', origin: 'manual', taskId: undefined })
    expect(h.twinReply).not.toHaveBeenCalled()
    expect(h.rows.get(conversationId)).toMatchObject({ side_a_controller: 'human', side_b_controller: 'twin', task_id: null })
  })

  it('開場失敗：對話設為 ended 再把錯誤丟給呼叫者（不留下沒人說話的對話）', async () => {
    const h = harness({
      reply: async () => {
        throw new Error('LLM 逾時')
      },
    })
    await expect(h.api.startConversation({ ...input, aController: 'twin' })).rejects.toThrow('LLM 逾時')
    const [created] = [...h.rows.values()]
    expect(created).toMatchObject({ status: 'ended', ended_at: '2026-10-30T12:00:00.000Z' })
  })

  it('輸入不正確（同一個人、缺 id）時丟 TwinError，不建立對話', async () => {
    const h = harness()
    await expect(h.api.startConversation({ ...input, aController: 'twin', bUserId: AN })).rejects.toThrow(TwinError)
    await expect(h.api.startConversation({ ...input, aController: 'twin', aUserId: '' })).rejects.toThrow(TwinError)
    expect(h.rows.size).toBe(0)
  })
})

describe('runTwinRounds', () => {
  it('一輪＝雙方分身各說一次；開場後跑 4 輪 → round_count 4、共 9 則、說話者輪流', async () => {
    const h = harness()
    const { conversationId } = await h.api.startConversation({ aUserId: AN, bUserId: ZHE, aController: 'twin', origin: 'auto' })

    const result = await h.api.runTwinRounds(conversationId, 4)

    expect(result).toEqual({ roundCount: 4, ended: false })
    expect(h.rows.get(conversationId)?.round_count).toBe(4)
    expect(h.messages).toHaveLength(9)
    expect(h.messages.map((m) => m.sender_id)).toEqual([AN, ZHE, AN, ZHE, AN, ZHE, AN, ZHE, AN])
  })

  it('接著上次的輪數往上加', async () => {
    const h = harness({ conv: row({ round_count: 4 }) })
    expect(await h.api.runTwinRounds('conv-1', 4)).toEqual({ roundCount: 8, ended: false })
    expect(h.twinReply).toHaveBeenCalledTimes(8)
  })

  it('沒有訊息時 a 方先說', async () => {
    const h = harness({ conv: row() })
    await h.api.runTwinRounds('conv-1', 1)
    expect(speakers(h)).toEqual([AN, ZHE])
  })

  it.each<[string, Controller, Controller, string[]]>([
    ['a 方是本人', 'human', 'twin', [ZHE, ZHE]],
    ['b 方是本人', 'twin', 'human', [AN, AN]],
  ])('%s：跳過該方，只有分身說話，輪數照算', async (_name, aCtrl, bCtrl, expected) => {
    const h = harness({ conv: row({ side_a_controller: aCtrl, side_b_controller: bCtrl }) })
    expect(await h.api.runTwinRounds('conv-1', 2)).toEqual({ roundCount: 2, ended: false })
    expect(speakers(h)).toEqual(expected)
  })

  it('雙方都是本人：分身不說話，輪數不變', async () => {
    const h = harness({ conv: row({ side_a_controller: 'human', side_b_controller: 'human', round_count: 3 }) })
    expect(await h.api.runTwinRounds('conv-1', 4)).toEqual({ roundCount: 3, ended: false })
    expect(h.twinReply).not.toHaveBeenCalled()
  })

  it(`達到 MAX_ROUNDS（${CONFIG.MAX_ROUNDS}）就停止並回 ended = true`, async () => {
    const h = harness({ conv: row({ round_count: CONFIG.MAX_ROUNDS - 1 }) })
    expect(await h.api.runTwinRounds('conv-1', 4)).toEqual({ roundCount: CONFIG.MAX_ROUNDS, ended: true })
    expect(h.twinReply).toHaveBeenCalledTimes(2)
  })

  it('已經到上限：不再說話，直接回 ended = true', async () => {
    const h = harness({ conv: row({ round_count: CONFIG.MAX_ROUNDS }) })
    expect(await h.api.runTwinRounds('conv-1', 4)).toEqual({ roundCount: CONFIG.MAX_ROUNDS, ended: true })
    expect(h.twinReply).not.toHaveBeenCalled()
  })

  it.each(['waiting_human', 'ended'] as const)('對話是 %s：不說話，回 ended = true', async (status) => {
    const h = harness({ conv: row({ status, round_count: 6 }) })
    expect(await h.api.runTwinRounds('conv-1', 4)).toEqual({ roundCount: 6, ended: true })
    expect(h.twinReply).not.toHaveBeenCalled()
  })

  it('跑到一半對話被改成 waiting_human：跑完那一輪就停', async () => {
    const h = harness({ conv: row() })
    h.twinReply.mockImplementationOnce(async (id: string, speaker: string) => {
      h.rows.set(id, { ...h.rows.get(id)!, status: 'waiting_human' })
      return { id: 'mx', conversation_id: id, sender_id: speaker, is_ai: true, content: 'x', created_at: '2026-10-30T10:00:00Z' }
    })
    expect(await h.api.runTwinRounds('conv-1', 4)).toEqual({ roundCount: 1, ended: true })
    expect(h.twinReply).toHaveBeenCalledTimes(2)
  })

  it('一輪內有一次失敗就丟錯，輪數不增加', async () => {
    const h = harness({ conv: row({ round_count: 2 }) })
    h.twinReply.mockRejectedValueOnce(new Error('LLM 失败'))
    await expect(h.api.runTwinRounds('conv-1', 4)).rejects.toThrow('LLM 失败')
    expect(h.rows.get('conv-1')?.round_count).toBe(2)
  })

  it('rounds 不是正整數、對話不存在時丟 TwinError', async () => {
    const h = harness({ conv: row() })
    await expect(h.api.runTwinRounds('conv-1', 0)).rejects.toThrow(TwinError)
    await expect(h.api.runTwinRounds('conv-1', 1.5)).rejects.toThrow(TwinError)
    await expect(h.api.runTwinRounds('nope', 1)).rejects.toThrow(TwinError)
  })
})

describe('getTranscript', () => {
  it('依 created_at 由舊到新排序', async () => {
    const msg = (id: string, at: string): ChatMessage => ({
      id,
      conversation_id: 'conv-1',
      sender_id: AN,
      is_ai: true,
      content: id,
      created_at: at,
    })
    const h = harness({
      conv: row(),
      messages: [msg('b', '2026-10-30T10:00:05Z'), msg('a', '2026-10-30T10:00:01Z'), msg('c', '2026-10-30T10:00:09Z')],
    })
    expect((await h.api.getTranscript('conv-1')).map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('endConversation', () => {
  const lastFrom = (sender: string): ChatMessage[] => [
    { id: 'm1', conversation_id: 'conv-1', sender_id: sender, is_ai: true, content: 'hi', created_at: '2026-10-30T10:00:00Z' },
  ]

  it('輪到的分身送出一則收尾（帶禮貌結束的指示），再設為 ended 並寫日誌', async () => {
    const h = harness({ conv: row(), messages: lastFrom(AN) })
    await h.api.endConversation('conv-1', 'unsuitable')

    expect(h.twinReply).toHaveBeenCalledTimes(1)
    expect(h.twinReply).toHaveBeenCalledWith('conv-1', ZHE, { extraInstruction: CLOSING_INSTRUCTION })
    expect(h.rows.get('conv-1')).toMatchObject({ status: 'ended', ended_at: '2026-10-30T12:00:00.000Z' })
    expect(h.logs).toContainEqual(expect.objectContaining({ agent: 'twin', action: '结束代聊', conversation_id: 'conv-1' }))
  })

  it('收尾指示：不再提問、不說不合適', () => {
    expect(CLOSING_INSTRUCTION).toContain('不要再提问')
    expect(CLOSING_INSTRUCTION).toContain('不合适')
  })

  it('輪到的一方是本人時，由另一方的分身收尾', async () => {
    const h = harness({ conv: row({ side_b_controller: 'human' }), messages: lastFrom(AN) })
    await h.api.endConversation('conv-1', 'declined')
    expect(speakers(h)).toEqual([AN])
  })

  it('雙方都是本人：不送收尾，直接結束', async () => {
    const h = harness({ conv: row({ side_a_controller: 'human', side_b_controller: 'human' }) })
    await h.api.endConversation('conv-1', 'done')
    expect(h.twinReply).not.toHaveBeenCalled()
    expect(h.rows.get('conv-1')?.status).toBe('ended')
  })

  it('收尾訊息失敗也照樣結束，並寫日誌', async () => {
    const h = harness({ conv: row() })
    h.twinReply.mockRejectedValueOnce(new Error('LLM 失败'))
    await expect(h.api.endConversation('conv-1', 'unsuitable')).resolves.toBeUndefined()
    expect(h.rows.get('conv-1')?.status).toBe('ended')
    expect(h.logs.map((l) => l.action)).toContain('收尾消息没发出去')
  })

  it('已經結束的對話：什麼都不做', async () => {
    const h = harness({ conv: row({ status: 'ended', ended_at: '2026-10-30T11:00:00Z' }) })
    await h.api.endConversation('conv-1', 'done')
    expect(h.twinReply).not.toHaveBeenCalled()
    expect(h.rows.get('conv-1')?.ended_at).toBe('2026-10-30T11:00:00Z')
  })
})

describe('markWaitingHuman', () => {
  it('狀態設為 waiting_human，之後 runTwinRounds 不再讓分身說話', async () => {
    const h = harness({ conv: row({ round_count: 8 }) })
    await h.api.markWaitingHuman('conv-1')
    expect(h.rows.get('conv-1')?.status).toBe('waiting_human')
    expect(await h.api.runTwinRounds('conv-1', 4)).toEqual({ roundCount: 8, ended: true })
    expect(h.twinReply).not.toHaveBeenCalled()
  })

  it('已經結束的對話丟 TwinError，不會被改回來', async () => {
    const h = harness({ conv: row({ status: 'ended' }) })
    await expect(h.api.markWaitingHuman('conv-1')).rejects.toThrow(TwinError)
    expect(h.rows.get('conv-1')?.status).toBe('ended')
  })
})
