// C7 請求真人：通知對方本人（格式 { conversationId, fromName }）、種子用戶 3 秒後自動回應、
// 回應 now／later／decline 各自的處理（資料庫、C6 接手、分身、結束對話、日誌全部用假的）。
import { describe, expect, it, vi } from 'vitest'
import type { AgentLogInput } from '../../shared/types'
import { ChatRoomError } from '../../server/twin/chatRoom'
import type { ConversationRow } from '../../server/twin/conversation'
import type { TakeoverView } from '../../server/twin/handoff'
import {
  createRequestHumanApi,
  LATER_INSTRUCTION,
  SEED_RESPONSE_DELAY_MS,
  type HumanResponse,
  type NotificationRow,
  type RequestHumanStore,
} from '../../server/twin/requestHuman'

const ME = 'user-me'
const AN = 'user-an'
const STRANGER = 'user-stranger'
const CONV_ID = 'conv-1'

function conv(overrides: Partial<ConversationRow> = {}): ConversationRow {
  return {
    id: CONV_ID,
    status: 'active',
    side_a: ME,
    side_b: AN,
    side_a_controller: 'human',
    side_b_controller: 'twin',
    opening_topic: null,
    task_id: null,
    round_count: 2,
    ...overrides,
  }
}

function notification(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: 'n-1',
    user_id: AN,
    type: 'request_human',
    payload: { conversationId: CONV_ID, fromName: '小明' },
    response: null,
    read_at: null,
    created_at: '2026-10-31T10:00:00.000Z',
    ...overrides,
  }
}

const TAKEOVER: TakeoverView = {
  conversationId: CONV_ID,
  verdict: null,
  summary: { key_points: [], other_highlights: [], twin_said: [], open_topics: [], suggested_replies: [] },
  summaryFailed: false,
}

interface Harness {
  conv?: ConversationRow | null
  seed?: boolean
  pending?: string | null
  notification?: NotificationRow | null
  saved?: boolean
  twinFails?: boolean
}

function harness(opts: Harness = {}) {
  const row = opts.conv === undefined ? conv() : opts.conv
  const note = opts.notification === undefined ? notification() : opts.notification
  const logs: AgentLogInput[] = []
  const inserted: { userId: string; payload: unknown }[] = []
  const scheduled: { ms: number; run: () => void }[] = []
  const store: RequestHumanStore = {
    getConversation: async (id) => (row && row.id === id ? { ...row } : null),
    getDisplayName: async (id) => (id === ME ? '小明' : '小安'),
    isSeedUser: vi.fn(async () => opts.seed ?? false),
    findPendingRequest: vi.fn(async () => opts.pending ?? null),
    insertRequestNotification: vi.fn(async (userId: string, payload: unknown) => {
      inserted.push({ userId, payload })
      return { id: 'n-new' }
    }),
    getNotification: vi.fn(async (id: string) => (note && note.id === id ? { ...note } : null)),
    saveResponse: vi.fn(async () => opts.saved ?? true),
    markRead: vi.fn(async () => undefined),
  }
  const deps = {
    store,
    takeOver: vi.fn(async () => TAKEOVER),
    twinReply: vi.fn(async () => {
      if (opts.twinFails) throw new Error('llm down')
      return { id: 'm-later', conversation_id: CONV_ID, sender_id: AN, is_ai: true, content: '本人晚点会上线', created_at: '' }
    }),
    endConversation: vi.fn(async () => undefined),
    writeLog: vi.fn(async (e: AgentLogInput) => {
      logs.push(e)
    }),
    schedule: (ms: number, run: () => void) => {
      scheduled.push({ ms, run })
    },
    now: () => new Date('2026-10-31T10:05:00.000Z'),
    seedAutoResponse: 'later' as HumanResponse,
  }
  const api = createRequestHumanApi(deps)
  return { api, deps, store, logs, inserted, scheduled }
}

async function expectError(promise: Promise<unknown>, status: number, message?: string) {
  const err = await promise.catch((e: unknown) => e)
  expect(err).toBeInstanceOf(ChatRoomError)
  expect((err as ChatRoomError).status).toBe(status)
  if (message) expect((err as ChatRoomError).message).toBe(message)
}

describe('requestHuman 請求真人', () => {
  it('通知對方本人：type request_human、payload { conversationId, fromName }，並寫日誌', async () => {
    const h = harness()
    const out = await h.api.requestHuman(CONV_ID, ME)
    expect(out).toEqual({ notificationId: 'n-new' })
    expect(h.inserted).toEqual([{ userId: AN, payload: { conversationId: CONV_ID, fromName: '小明' } }])
    expect(h.logs).toHaveLength(1)
    expect(h.logs[0]).toMatchObject({ user_id: ME, agent: 'twin', conversation_id: CONV_ID })
    expect(h.logs[0]!.reason).toBeTruthy()
  })

  it('對方是種子用戶：3 秒後自動用 SEED_AUTO_RESPONSE（later）回應，分身說本人晚點上線', async () => {
    const h = harness({ seed: true, notification: notification({ id: 'n-new' }) })
    await h.api.requestHuman(CONV_ID, ME)
    expect(h.scheduled).toHaveLength(1)
    expect(h.scheduled[0]!.ms).toBe(SEED_RESPONSE_DELAY_MS)
    expect(SEED_RESPONSE_DELAY_MS).toBe(3000)
    expect(h.deps.twinReply).not.toHaveBeenCalled()

    h.scheduled[0]!.run()
    await vi.waitFor(() => expect(h.deps.twinReply).toHaveBeenCalled())
    expect(h.deps.twinReply).toHaveBeenCalledWith(CONV_ID, AN, { extraInstruction: LATER_INSTRUCTION })
    expect(h.store.saveResponse).toHaveBeenCalledWith('n-new', 'later', '2026-10-31T10:05:00.000Z')
    await vi.waitFor(() => expect(h.logs.some((l) => l.user_id === AN && l.detail?.auto === true)).toBe(true))
  })

  it('對方不是種子用戶：不排自動回應', async () => {
    const h = harness({ seed: false })
    await h.api.requestHuman(CONV_ID, ME)
    expect(h.scheduled).toHaveLength(0)
  })

  it('種子用戶自動回應失敗：只記錄，不丟出未處理的錯誤', async () => {
    const h = harness({ seed: true, notification: null })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await h.api.requestHuman(CONV_ID, ME)
    h.scheduled[0]!.run()
    await vi.waitFor(() => expect(spy).toHaveBeenCalled())
    spy.mockRestore()
  })

  it('不是成員 → 403；找不到對話 → 404', async () => {
    await expectError(harness().api.requestHuman(CONV_ID, STRANGER), 403)
    await expectError(harness({ conv: null }).api.requestHuman(CONV_ID, ME), 404)
  })

  it('對話已結束、對方本人已在聊 → 409，不發通知', async () => {
    const ended = harness({ conv: conv({ status: 'ended' }) })
    await expectError(ended.api.requestHuman(CONV_ID, ME), 409, '这段对话已经结束了')
    const human = harness({ conv: conv({ side_b_controller: 'human' }) })
    await expectError(human.api.requestHuman(CONV_ID, ME), 409)
    expect(ended.inserted).toHaveLength(0)
    expect(human.inserted).toHaveLength(0)
  })

  it('已經請求過、對方還沒回應 → 409，不重複通知', async () => {
    const h = harness({ pending: 'n-old' })
    await expectError(h.api.requestHuman(CONV_ID, ME), 409)
    expect(h.store.findPendingRequest).toHaveBeenCalledWith(CONV_ID, AN)
    expect(h.inserted).toHaveLength(0)
  })

  it('同一個人同時按兩次：只發一則通知', async () => {
    const h = harness()
    const results = await Promise.allSettled([h.api.requestHuman(CONV_ID, ME), h.api.requestHuman(CONV_ID, ME)])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(h.inserted).toHaveLength(1)
  })
})

describe('respond 回應請求真人', () => {
  it('now → 走 C6 接手，回傳接手卡片', async () => {
    const h = harness()
    const out = await h.api.respond('n-1', AN, 'now')
    expect(out).toEqual({ response: 'now', conversationId: CONV_ID, handoff: TAKEOVER })
    expect(h.deps.takeOver).toHaveBeenCalledWith(CONV_ID, AN)
    expect(h.store.saveResponse).toHaveBeenCalledWith('n-1', 'now', '2026-10-31T10:05:00.000Z')
    expect(h.deps.twinReply).not.toHaveBeenCalled()
    expect(h.deps.endConversation).not.toHaveBeenCalled()
  })

  it('later → 我方分身說「本人晚點會上線」，對話不結束', async () => {
    const h = harness()
    const out = await h.api.respond('n-1', AN, 'later')
    expect(out).toEqual({ response: 'later', conversationId: CONV_ID, handoff: null })
    expect(h.deps.twinReply).toHaveBeenCalledWith(CONV_ID, AN, { extraInstruction: LATER_INSTRUCTION })
    expect(LATER_INSTRUCTION).toContain('本人晚点会上线')
    expect(h.deps.endConversation).not.toHaveBeenCalled()
    expect(h.deps.takeOver).not.toHaveBeenCalled()
  })

  it('decline → 分身禮貌收尾、對話結束（endConversation declined）', async () => {
    const h = harness()
    const out = await h.api.respond('n-1', AN, 'decline')
    expect(out).toEqual({ response: 'decline', conversationId: CONV_ID, handoff: null })
    expect(h.deps.endConversation).toHaveBeenCalledWith(CONV_ID, 'declined')
  })

  it('每個回應都寫日誌（回應的人、對話、理由）', async () => {
    for (const r of ['now', 'later', 'decline'] as const) {
      const h = harness()
      await h.api.respond('n-1', AN, r)
      const log = h.logs.find((l) => l.user_id === AN)
      expect(log).toMatchObject({ agent: 'twin', conversation_id: CONV_ID })
      expect(log!.reason).toBeTruthy()
    }
  })

  it('later 時分身沒說成：回應照樣記下，日誌寫錯誤', async () => {
    const h = harness({ twinFails: true })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(h.api.respond('n-1', AN, 'later')).resolves.toMatchObject({ response: 'later' })
    expect(h.logs.some((l) => l.detail?.error === 'llm down')).toBe(true)
    spy.mockRestore()
  })

  it('不是自己的通知、找不到 → 404', async () => {
    await expectError(harness().api.respond('n-1', ME, 'now'), 404)
    await expectError(harness({ notification: null }).api.respond('n-1', AN, 'now'), 404)
  })

  it('不是請求真人的通知 → 400', async () => {
    const h = harness({ notification: notification({ type: 'match' }) })
    await expectError(h.api.respond('n-1', AN, 'now'), 400)
  })

  it('已經回應過 → 409，不做任何動作', async () => {
    const h = harness({ notification: notification({ response: 'later' }) })
    await expectError(h.api.respond('n-1', AN, 'decline'), 409)
    expect(h.store.saveResponse).not.toHaveBeenCalled()
    expect(h.deps.endConversation).not.toHaveBeenCalled()
  })

  it('同時回應兩次（條件更新沒改到）→ 409，不做任何動作', async () => {
    const h = harness({ saved: false })
    await expectError(h.api.respond('n-1', AN, 'decline'), 409)
    expect(h.deps.endConversation).not.toHaveBeenCalled()
  })

  it('對話已經結束 → 通知設為已讀並回 409', async () => {
    const h = harness({ conv: conv({ status: 'ended' }) })
    await expectError(h.api.respond('n-1', AN, 'now'), 409, '这段对话已经结束了')
    expect(h.store.markRead).toHaveBeenCalledWith('n-1', AN, '2026-10-31T10:05:00.000Z')
    expect(h.store.saveResponse).not.toHaveBeenCalled()
    expect(h.deps.takeOver).not.toHaveBeenCalled()
  })

  it('payload 沒有對話 id → 404', async () => {
    const h = harness({ notification: notification({ payload: { fromName: '小明' } }) })
    await expectError(h.api.respond('n-1', AN, 'now'), 404)
  })

  it('我方已經本人在聊：記下回應，不再接手、不讓分身說話、不結束', async () => {
    const h = harness({ conv: conv({ side_b_controller: 'human' }) })
    for (const r of ['now', 'later', 'decline'] as const) {
      await expect(h.api.respond('n-1', AN, r)).resolves.toEqual({ response: r, conversationId: CONV_ID, handoff: null })
    }
    expect(h.deps.takeOver).not.toHaveBeenCalled()
    expect(h.deps.twinReply).not.toHaveBeenCalled()
    expect(h.deps.endConversation).not.toHaveBeenCalled()
  })
})
