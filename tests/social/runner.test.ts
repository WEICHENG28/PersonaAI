import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentLogInput, AgentTask, Evaluation, LobbyCandidate, VerdictValue } from '../../shared/types'
import { CONFIG } from '../../server/lib/config'
import { setLogWriter } from '../../server/lib/log'
import { MemoryAgentStore } from '../../server/social/agentStore'
import { decideGuard, isNotifiable, isTaskDone, reachedDailyLimit } from '../../server/social/guards'
import { runTaskStep, runTaskStepSafely, type RunnerDeps } from '../../server/social/runner'
import { pickMostSimilar } from '../../server/social/runnerDeps'

const NOW = new Date('2026-10-30T12:00:00')

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 't1',
    user_id: 'me',
    kind: 'search',
    raw_instruction: '帮我找 3 个喜欢登山的人聊聊',
    restatement: '帮你找 3 位喜欢登山的运动伙伴',
    purpose: 'sport',
    conditions: ['喜欢登山'],
    target_count: 3,
    done_condition: { suitable_count: 2, max_chats: 6, deadline: null },
    target_user_id: null,
    status: 'running',
    progress: { screened: 0, chats: 0, suitable: 0 },
    active_conversation_id: null,
    attempted_user_ids: [],
    ...overrides,
  }
}

const candidate = (id: string, similarity: number): LobbyCandidate => ({
  user_id: id,
  display_name: id,
  shareable: { intro: '', interests: ['登山'], chat_style: '', looking_for: '' },
  similarity,
})

function evaluation(mine: VerdictValue, theirs: VerdictValue, round = 8): Evaluation {
  const v = (id: string, verdict: VerdictValue) => ({
    perspective_user_id: id,
    direction_score: verdict === 'suitable' ? 80 : 40,
    verdict,
    reason_type: verdict === 'unsuitable' ? ('friction' as const) : null,
    reason_text: verdict === 'unsuitable' ? '话题接不上' : null,
    outline: { topics: ['登山'], fits: [], frictions: [], highlights: [], fit_points: [] },
  })
  return { a: v('me', mine), b: v('xiaoan', theirs), round }
}

let store: MemoryAgentStore
let logs: AgentLogInput[]
let deps: RunnerDeps

beforeEach(() => {
  store = new MemoryAgentStore()
  logs = []
  setLogWriter(async (e) => {
    logs.push(e)
  })
  deps = {
    store,
    now: () => NOW,
    searchLobby: vi.fn(async () => [candidate('xiaoan', 0.9), candidate('azhe', 0.7)]),
    pick: pickMostSimilar,
    evaluate: vi.fn(async () => evaluation('suitable', 'suitable')),
    decide: vi.fn(async () => null),
    buildReport: vi.fn(async (t: AgentTask) => ({
      task_id: t.id,
      purpose: t.purpose,
      screened: t.progress.screened,
      chats: t.progress.chats,
      suitable: [],
      unsuitable_reasons: [],
      saved_minutes: 0,
      basis: '',
    })),
    deliverReport: vi.fn(async () => {}),
    startConversation: vi.fn(async () => ({ conversationId: 'conv-1' })),
    runTwinRounds: vi.fn(async () => ({ roundCount: CONFIG.MIN_ROUNDS_BEFORE_JUDGE, ended: false })),
    endConversation: vi.fn(async () => {}),
    markWaitingHuman: vi.fn(async () => {}),
    guardText: vi.fn(async (text: string) => ({ ok: true, text, issues: [] })),
  }
})

afterEach(() => setLogWriter(null))

const put = (task: AgentTask) => store.tasks.set(task.id, task)
const chatting = (overrides: Partial<AgentTask> = {}) =>
  makeTask({ active_conversation_id: 'conv-1', attempted_user_ids: ['xiaoan'], progress: { screened: 2, chats: 1, suitable: 0 }, ...overrides })

describe('任務守門規則', () => {
  it('isTaskDone：合適人數、代聊場數、期限任一達到', () => {
    expect(isTaskDone(makeTask(), NOW)).toBe(false)
    expect(isTaskDone(makeTask({ progress: { screened: 0, chats: 0, suitable: 2 } }), NOW)).toBe(true)
    expect(isTaskDone(makeTask({ progress: { screened: 0, chats: 6, suitable: 0 } }), NOW)).toBe(true)
    expect(isTaskDone(makeTask({ done_condition: { deadline: '2026-10-29T00:00:00' } }), NOW)).toBe(true)
  })

  it('reachedDailyLimit', () => {
    expect(reachedDailyLimit(9, 10)).toBe(false)
    expect(reachedDailyLimit(10, 10)).toBe(true)
  })

  it('isNotifiable 依檔位', () => {
    expect(isNotifiable('one_way', 'suitable', 'unsuitable')).toBe(true)
    expect(isNotifiable('mutual', 'suitable', 'unsuitable')).toBe(false)
    expect(isNotifiable('mutual', 'suitable', 'suitable')).toBe(true)
  })
})

describe('decideGuard 四種狀況', () => {
  const ctx = { tier: 'mutual' as const, round: 8 }
  it('不確定且還沒到上限 → 繼續聊', () => {
    expect(decideGuard(null, { ...ctx, mine: 'uncertain', theirs: 'suitable' }).action).toBe('continue_chat')
  })
  it('不確定且到上限 → 結束，原因「聊得不夠深」', () => {
    const d = decideGuard(null, { ...ctx, round: CONFIG.MAX_ROUNDS, mine: 'suitable', theirs: 'uncertain' })
    expect(d).toMatchObject({ action: 'end_conversation', reason: { type: 'friction', text: '聊得不够深，无法判断' } })
  })
  it('符合檔位 → 通知；LLM 建議不同時以程式為準並註明', () => {
    const d = decideGuard('end_conversation', { ...ctx, mine: 'suitable', theirs: 'suitable' })
    expect(d.action).toBe('notify_user')
    expect(d.overridden).toContain('按程序规则改为 notify_user')
  })
  it('其他 → 結束', () => {
    expect(decideGuard(null, { ...ctx, mine: 'suitable', theirs: 'unsuitable' }).action).toBe('end_conversation')
  })
})

describe('runTaskStep', () => {
  it('沒有進行中的對話 → 搜尋大廳、選相似度最高的人、開始代聊', async () => {
    put(makeTask())
    expect(await runTaskStep('t1', deps)).toBe('started_chat')
    const t = store.tasks.get('t1')!
    expect(t).toMatchObject({ active_conversation_id: 'conv-1', attempted_user_ids: ['xiaoan'], progress: { screened: 2, chats: 1 } })
    expect(deps.startConversation).toHaveBeenCalledWith(expect.objectContaining({ bUserId: 'xiaoan', aController: 'twin', origin: 'auto' }))
    expect(logs.at(-1)?.action).toBe('开始代聊：xiaoan')
  })

  it('未滿 8 輪不判定', async () => {
    put(chatting())
    deps.runTwinRounds = vi.fn(async () => ({ roundCount: 4, ended: false }))
    expect(await runTaskStep('t1', deps)).toBe('chatting')
    expect(deps.evaluate).not.toHaveBeenCalled()
  })

  it('合適就通知：記錄嘗試、等本人上線、發通知、合適 +1', async () => {
    put(chatting())
    expect(await runTaskStep('t1', deps)).toBe('notified')
    expect(store.attempts[0]).toMatchObject({ target_user_id: 'xiaoan', result: 'mutual', origin: 'auto' })
    expect(deps.markWaitingHuman).toHaveBeenCalledWith('conv-1')
    expect(store.notifications[0]?.payload).toEqual({ conversationId: 'conv-1', targetName: 'xiaoan', mutual: true, taskId: 't1' })
    expect(store.tasks.get('t1')).toMatchObject({ active_conversation_id: null, progress: { suitable: 1 } })
  })

  it('雙方都記一筆歷史（對方不是種子用戶時），各用自己視角的結果', async () => {
    put(chatting())
    deps.evaluate = vi.fn(async () => evaluation('suitable', 'suitable'))
    await runTaskStep('t1', deps)
    expect(store.attempts.map((a) => [a.user_id, a.target_user_id, a.result])).toEqual([
      ['me', 'xiaoan', 'mutual'],
      ['xiaoan', 'me', 'mutual'],
    ])
  })

  it('對方是種子用戶 → 只記我方', async () => {
    put(chatting())
    store.seedUserIds.add('xiaoan')
    await runTaskStep('t1', deps)
    expect(store.attempts).toHaveLength(1)
  })

  it('只有我覺得合適、檔位雙向 → 結束，雙方都記不合適，我方原因是匹配不雙向；原因先過隱私守門', async () => {
    put(chatting())
    deps.evaluate = vi.fn(async () => evaluation('suitable', 'unsuitable'))
    expect(await runTaskStep('t1', deps)).toBe('ended_chat')
    expect(store.attempts.map((a) => [a.user_id, a.result, a.reason_type])).toEqual([
      ['me', 'unsuitable', 'not_mutual'],
      ['xiaoan', 'unsuitable', 'friction'],
    ])
    expect(deps.guardText).toHaveBeenCalledWith(expect.any(String), 'xiaoan')
    expect(deps.guardText).toHaveBeenCalledWith('话题接不上', 'me')
  })

  it('不合適就結束並記錄原因', async () => {
    put(chatting())
    deps.evaluate = vi.fn(async () => evaluation('unsuitable', 'suitable'))
    expect(await runTaskStep('t1', deps)).toBe('ended_chat')
    expect(store.attempts[0]).toMatchObject({ result: 'unsuitable', reason_type: 'friction', reason_text: '话题接不上' })
    expect(deps.endConversation).toHaveBeenCalledWith('conv-1', 'unsuitable')
    expect(store.tasks.get('t1')?.active_conversation_id).toBeNull()
  })

  it('本人已接手 → 清掉進行中的對話，不再代聊', async () => {
    put(chatting())
    store.conversations.set('conv-1', { status: 'active', sideAController: 'human', sideBController: 'twin' })
    expect(await runTaskStep('t1', deps)).toBe('chat_cleared')
    expect(deps.runTwinRounds).not.toHaveBeenCalled()
  })

  it('對方本人接手（b 方是 human）→ 不再呼叫 runTwinRounds，清掉進行中的對話', async () => {
    put(chatting())
    store.conversations.set('conv-1', { status: 'active', sideAController: 'twin', sideBController: 'human' })
    expect(await runTaskStep('t1', deps)).toBe('chat_cleared')
    expect(deps.runTwinRounds).not.toHaveBeenCalled()
    expect(deps.evaluate).not.toHaveBeenCalled()
    expect(store.tasks.get('t1')?.active_conversation_id).toBeNull()
    expect(store.attempts).toHaveLength(0)
  })

  it('達到完成條件 → 任務完成並交給 AI 朋友回報', async () => {
    put(makeTask({ progress: { screened: 4, chats: 3, suitable: 2 } }))
    expect(await runTaskStep('t1', deps)).toBe('finished')
    expect(store.tasks.get('t1')?.status).toBe('done')
    expect(deps.deliverReport).toHaveBeenCalledWith('me', expect.objectContaining({ task_id: 't1' }))
  })

  it('達每日代聊上限 → 暫停', async () => {
    put(makeTask())
    store.autoChatsToday = 10
    expect(await runTaskStep('t1', deps)).toBe('paused_daily_limit')
    expect(store.tasks.get('t1')?.status).toBe('paused')
  })

  it('大廳沒有新對象 → 任務完成', async () => {
    put(makeTask())
    deps.searchLobby = vi.fn(async () => [])
    expect(await runTaskStep('t1', deps)).toBe('no_candidate')
    expect(store.tasks.get('t1')?.status).toBe('done')
  })

  it('發起對話失敗會重試，仍失敗就把這位記為已嘗試', async () => {
    put(makeTask())
    vi.spyOn(console, 'error').mockImplementation(() => {})
    deps.startConversation = vi.fn(async () => {
      throw new Error('down')
    })
    expect(await runTaskStep('t1', deps)).toBe('start_failed')
    expect(deps.startConversation).toHaveBeenCalledTimes(CONFIG.TOOL_MAX_RETRIES + 1)
    expect(store.tasks.get('t1')?.attempted_user_ids).toEqual(['xiaoan'])
  })

  it('不是 running 的任務不動', async () => {
    put(makeTask({ status: 'paused' }))
    expect(await runTaskStep('t1', deps)).toBe('not_running')
  })

  it('規劃器建議和程式規則不同 → 以程式為準，日誌註明', async () => {
    put(chatting())
    deps.decide = vi.fn(async () => ({ action: 'end_conversation' as const, reason: '我觉得不合适' }))
    expect(await runTaskStep('t1', deps)).toBe('notified')
    expect(logs.some((l) => l.action === '决策由程序规则修正' && l.reason?.includes('notify_user'))).toBe(true)
  })

  it('規劃器和程式規則一致 → 日誌用規劃器的理由', async () => {
    put(chatting())
    deps.decide = vi.fn(async () => ({ action: 'notify_user' as const, reason: '双方都觉得聊得来' }))
    await runTaskStep('t1', deps)
    expect(logs.at(-1)).toMatchObject({ action: '双向合适，通知你', reason: '双方都觉得聊得来' })
  })

  it('評審判「不確定」→ 繼續聊', async () => {
    put(chatting())
    deps.evaluate = vi.fn(async () => evaluation('uncertain', 'suitable'))
    expect(await runTaskStep('t1', deps)).toBe('continue_chat')
  })
})

describe('runTaskStepSafely', () => {
  it(`連續失敗 ${CONFIG.TASK_MAX_FAILS} 次就暫停任務，不丟錯`, async () => {
    put(chatting())
    vi.spyOn(console, 'error').mockImplementation(() => {})
    deps.runTwinRounds = vi.fn(async () => {
      throw new Error('twin down')
    })
    const outcomes = []
    for (let i = 0; i < CONFIG.TASK_MAX_FAILS; i++) outcomes.push(await runTaskStepSafely('t1', deps))
    expect(outcomes.at(-1)).toBe('paused_failures')
    expect(store.tasks.get('t1')?.status).toBe('paused')
  })

  it('成功一步就把失敗次數歸零', async () => {
    put(chatting())
    await store.bumpFailCount('t1')
    await runTaskStepSafely('t1', deps)
    expect(store.failCounts.get('t1')).toBe(0)
  })
})
