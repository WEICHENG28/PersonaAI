// C8 言行異常提醒：何時檢查（≥15 則且是 5 的倍數）、Prompt 9 只拿對外檔案與本人訊息、極度不一致才標記並只通知對方、
// 選擇寫回 user_choice（結束對話才結束）。資料庫、A 的檔案、LLM、日誌全部用假的。
import { describe, expect, it, vi } from 'vitest'
import type { AgentLogInput, ShareableProfile } from '../../shared/types'
import type { LlmJsonOptions } from '../../server/lib/llm'
import {
  ANOMALY_MESSAGES_LIMIT,
  createAnomalyApi,
  isFlagged,
  shouldCheck,
  type AnomalyFlagRow,
  type AnomalyStore,
  type NewAnomalyFlag,
} from '../../server/twin/anomaly'
import { ChatRoomError } from '../../server/twin/chatRoom'
import type { ConversationRow } from '../../server/twin/conversation'
import type { NotificationRow } from '../../server/twin/requestHuman'
import { anomalyResultSchema, anomalyUserMessage, EVIDENCE_CHARS, renderAnomalySystem } from '../../server/prompts/09_anomaly'

const RUDE = 'user-rude'
const ME = 'user-me'
const CONV_ID = 'conv-1'

const SHAREABLE: ShareableProfile = { intro: '温和的登山爱好者', interests: ['登山'], chat_style: '温和有礼', looking_for: '一起爬山的朋友' }

function conv(overrides: Partial<ConversationRow> = {}): ConversationRow {
  return {
    id: CONV_ID,
    status: 'active',
    side_a: RUDE,
    side_b: ME,
    side_a_controller: 'human',
    side_b_controller: 'human',
    opening_topic: null,
    task_id: null,
    round_count: 0,
    ...overrides,
  }
}

interface Harness {
  conv?: ConversationRow | null
  count?: number
  flagged?: boolean
  shareable?: ShareableProfile | null
  llm?: unknown
  llmFails?: boolean
  notification?: NotificationRow | null
  flag?: AnomalyFlagRow | null
  saved?: boolean
  endFails?: boolean
}

function harness(opts: Harness = {}) {
  const row = opts.conv === undefined ? conv() : opts.conv
  const messages = Array.from({ length: opts.count ?? 15 }, (_, i) => `第${i + 1}句`)
  const logs: AgentLogInput[] = []
  const flags: NewAnomalyFlag[] = []
  const notes: { userId: string; payload: unknown }[] = []
  const llmCalls: LlmJsonOptions<unknown>[] = []
  const store: AnomalyStore = {
    getConversation: async (id) => (row && row.id === id ? { ...row } : null),
    listHumanMessages: vi.fn(async () => [...messages]),
    hasFlag: vi.fn(async () => opts.flagged ?? false),
    insertFlag: vi.fn(async (f: NewAnomalyFlag) => {
      flags.push(f)
      return { id: 'flag-1' }
    }),
    insertAnomalyNotification: vi.fn(async (userId: string, payload: unknown) => {
      notes.push({ userId, payload })
      return { id: 'n-1' }
    }),
    getNotification: async () =>
      opts.notification === undefined
        ? { id: 'n-1', user_id: ME, type: 'anomaly', payload: { conversationId: CONV_ID, flagId: 'flag-1', evidence: [] }, response: null, read_at: null, created_at: '' }
        : opts.notification,
    getFlag: async () =>
      opts.flag === undefined ? { id: 'flag-1', conversation_id: CONV_ID, notify_user_id: ME, user_choice: null } : opts.flag,
    saveChoice: vi.fn(async () => opts.saved ?? true),
    clearChoice: vi.fn(async () => undefined),
    markRead: vi.fn(async () => undefined),
    clearResponse: vi.fn(async () => undefined),
  }
  const deps = {
    store,
    getShareableProfile: vi.fn(async () => (opts.shareable === undefined ? SHAREABLE : opts.shareable)),
    getStyleProfile: vi.fn(async () => null),
    llmJson: vi.fn(async <T,>(o: LlmJsonOptions<T>): Promise<T> => {
      llmCalls.push(o as LlmJsonOptions<unknown>)
      if (opts.llmFails) throw new Error('llm down')
      return o.schema.parse(opts.llm ?? { is_extreme: false, type: null, evidence: [] })
    }),
    writeLog: vi.fn(async (e: AgentLogInput) => {
      logs.push(e)
    }),
    endConversation: vi.fn(async () => {
      if (opts.endFails) throw new Error('db down')
    }),
    now: () => new Date('2026-10-31T12:00:00.000Z'),
    minMessages: 15,
    checkEvery: 5,
  }
  return { api: createAnomalyApi(deps), deps, store, logs, flags, notes, llmCalls }
}

const EXTREME = { is_extreme: true, type: 'abuse', evidence: ['多次辱骂对方', '人身攻击'] }

describe('shouldCheck', () => {
  it('本人訊息 ≥ 15 且是 5 的倍數才檢查', () => {
    expect([14, 15, 16, 19, 20, 25].map((n) => shouldCheck(n, 15, 5))).toEqual([false, true, false, false, true, true])
    expect(shouldCheck(10, 15, 5)).toBe(false)
  })
})

describe('Prompt 9', () => {
  it('is_extreme 但 type 不在清單裡 → 不算異常；evidence 最多 3 點、截斷', () => {
    const bad = anomalyResultSchema.parse({ is_extreme: true, type: 'rude', evidence: [] })
    expect(isFlagged(bad)).toBe(false)
    const long = anomalyResultSchema.parse({ is_extreme: true, type: 'pressure', evidence: ['a'.repeat(100), 'b', 'c', 'd', ' '] })
    expect(long.evidence).toHaveLength(3)
    expect(long.evidence[0]).toHaveLength(EVIDENCE_CHARS)
    expect(isFlagged(long)).toBe(true)
  })

  it('system 有對外描述、門檻與「不確定時回 false」；本人訊息放在 <messages> 標籤', () => {
    const system = renderAnomalySystem(SHAREABLE, null)
    expect(system).toContain('温和的登山爱好者')
    expect(system).toContain('心情不好、慢热、回复较短')
    expect(system).toContain('不确定时一律回 is_extreme = false')
    expect(system).toContain('用简体中文回复')
    expect(anomalyUserMessage(['你好\n啊', '再见'])).toBe('<messages>\n你好 啊\n再见\n</messages>\n只输出 JSON。')
  })
})

describe('checkAfterHumanMessage', () => {
  it('第 15 則：跑 Prompt 9（reason、temperature 0），只拿對外檔案和本人訊息', async () => {
    const h = harness()
    expect(await h.api.checkAfterHumanMessage(CONV_ID, RUDE)).toBe('normal')
    expect(h.llmCalls).toHaveLength(1)
    expect(h.llmCalls[0]).toMatchObject({ role: 'reason', temperature: 0 })
    expect(h.deps.getShareableProfile).toHaveBeenCalledWith(RUDE)
    expect(h.llmCalls[0]!.messages[0]!.content).toContain('第15句')
  })

  it('沒異常：不標記、不通知，日誌寫給對方（被檢查的人看不到）', async () => {
    const h = harness()
    await h.api.checkAfterHumanMessage(CONV_ID, RUDE)
    expect(h.flags).toHaveLength(0)
    expect(h.notes).toHaveLength(0)
    expect(h.logs).toHaveLength(1)
    expect(h.logs[0]).toMatchObject({ user_id: ME, agent: 'guard', conversation_id: CONV_ID })
    expect(h.logs.some((l) => l.user_id === RUDE)).toBe(false)
  })

  it('極度不一致：寫入 anomaly_flags、只通知對方（type anomaly，附行為摘要）', async () => {
    const h = harness({ llm: EXTREME })
    expect(await h.api.checkAfterHumanMessage(CONV_ID, RUDE)).toBe('flagged')
    expect(h.flags).toEqual([
      { conversation_id: CONV_ID, flagged_user_id: RUDE, notify_user_id: ME, anomaly_type: 'abuse', evidence: ['多次辱骂对方', '人身攻击'] },
    ])
    expect(h.notes).toEqual([{ userId: ME, payload: { conversationId: CONV_ID, flagId: 'flag-1', evidence: ['多次辱骂对方', '人身攻击'] } }])
    expect(h.logs.every((l) => l.user_id === ME)).toBe(true)
  })

  it('不到門檻或不是倍數：不呼叫 LLM', async () => {
    for (const count of [14, 16, 19]) {
      const h = harness({ count })
      expect(await h.api.checkAfterHumanMessage(CONV_ID, RUDE)).toBe('skipped')
      expect(h.llmCalls).toHaveLength(0)
    }
  })

  it('只帶最新的 ANOMALY_MESSAGES_LIMIT 則', async () => {
    const h = harness({ count: 40 })
    await h.api.checkAfterHumanMessage(CONV_ID, RUDE)
    const content = h.llmCalls[0]!.messages[0]!.content
    expect(content.split('\n').filter((l) => l.startsWith('第'))).toHaveLength(ANOMALY_MESSAGES_LIMIT)
    expect(content).toContain('第40句')
    expect(content).not.toContain('第10句')
  })

  it('已經標記過、沒有對外描述、對話已結束、發言者不是本人或不是成員：不檢查', async () => {
    const cases: Harness[] = [
      { flagged: true },
      { shareable: null },
      { conv: conv({ status: 'ended' }) },
      { conv: conv({ side_a_controller: 'twin' }) },
      { conv: null },
    ]
    for (const c of cases) {
      const h = harness(c)
      expect(await h.api.checkAfterHumanMessage(CONV_ID, RUDE)).toBe('skipped')
      expect(h.llmCalls).toHaveLength(0)
    }
    expect(await harness().api.checkAfterHumanMessage(CONV_ID, 'user-stranger')).toBe('skipped')
  })

  it('LLM 失敗：不丟錯、不標記', async () => {
    const h = harness({ llmFails: true })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(h.api.checkAfterHumanMessage(CONV_ID, RUDE)).resolves.toBe('skipped')
    expect(h.flags).toHaveLength(0)
    spy.mockRestore()
  })
})

async function expectError(promise: Promise<unknown>, status: number) {
  const err = await promise.catch((e: unknown) => e)
  expect(err).toBeInstanceOf(ChatRoomError)
  expect((err as ChatRoomError).status).toBe(status)
}

describe('respond（言行異常提醒的選擇）', () => {
  it('end → 寫回 user_choice、設已讀、結束對話（自己的分身收尾），寫日誌', async () => {
    const h = harness()
    expect(await h.api.respond('n-1', ME, 'end')).toEqual({ choice: 'end', conversationId: CONV_ID })
    expect(h.store.saveChoice).toHaveBeenCalledWith('flag-1', 'end')
    expect(h.store.markRead).toHaveBeenCalledWith('n-1', ME, '2026-10-31T12:00:00.000Z')
    expect(h.deps.endConversation).toHaveBeenCalledWith(CONV_ID, ME)
    expect(h.logs[0]).toMatchObject({ user_id: ME, agent: 'guard', conversation_id: CONV_ID })
  })

  it('continue、report → 只記錄，不結束對話', async () => {
    for (const choice of ['continue', 'report'] as const) {
      const h = harness()
      await h.api.respond('n-1', ME, choice)
      expect(h.store.saveChoice).toHaveBeenCalledWith('flag-1', choice)
      expect(h.deps.endConversation).not.toHaveBeenCalled()
    }
  })

  it('結束對話失敗 → 改回沒選過、通知改回未讀，回 503 讓用戶重按', async () => {
    const h = harness({ endFails: true })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expectError(h.api.respond('n-1', ME, 'end'), 503)
    expect(h.store.clearChoice).toHaveBeenCalledWith('flag-1')
    expect(h.store.clearResponse).toHaveBeenCalledWith('n-1')
    expect(h.logs).toHaveLength(0)
    spy.mockRestore()
  })

  it('別人的通知 404、不是言行異常的通知 400、已經選過 409、同時選兩次 409', async () => {
    await expectError(harness().api.respond('n-1', RUDE, 'end'), 404)
    await expectError(
      harness({ notification: { id: 'n-1', user_id: ME, type: 'match', payload: {}, response: null, read_at: null, created_at: '' } }).api.respond('n-1', ME, 'end'),
      400,
    )
    await expectError(harness({ flag: { id: 'flag-1', conversation_id: CONV_ID, notify_user_id: ME, user_choice: 'continue' } }).api.respond('n-1', ME, 'end'), 409)
    const race = harness({ saved: false })
    await expectError(race.api.respond('n-1', ME, 'end'), 409)
    expect(race.deps.endConversation).not.toHaveBeenCalled()
  })

  it('標記不是提醒我的 → 404', async () => {
    const h = harness({ flag: { id: 'flag-1', conversation_id: CONV_ID, notify_user_id: RUDE, user_choice: null } })
    await expectError(h.api.respond('n-1', ME, 'continue'), 404)
  })
})
