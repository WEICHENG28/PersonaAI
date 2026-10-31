// C5 代聊結果頁後端：只讀我方的 match_attempts、雙向合適、為什麼你們合、輪數換算、讓分身繼續聊（資料庫與代聊函式全部用假的）。
import { describe, expect, it, vi } from 'vitest'
import type { AgentLogInput } from '../../shared/types'
import { ChatRoomError, type ChatMessageView, type ScoreRow } from '../../server/twin/chatRoom'
import type { ConversationRow } from '../../server/twin/conversation'
import {
  continueBlock,
  createResultApi,
  parseOutline,
  withRounds,
  type AttemptRow,
  type ResultStore,
} from '../../server/twin/result'

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
    round_count: 8,
    ...overrides,
  }
}

function msg(i: number, sender: string): ChatMessageView {
  const sec = String(i).padStart(2, '0')
  return { id: `m${i}`, conversation_id: 'conv-1', sender_id: sender, is_ai: true, guard_rewritten: false, content: `第${i}则`, created_at: `2026-10-30T10:00:${sec}.000Z` }
}

const MY_OUTLINE = {
  topics: ['登山', '摄影'],
  fits: ['都喜欢慢慢走'],
  frictions: ['作息不同'],
  highlights: ['会主动分享路线'],
  fit_points: [
    { concern: '喜欢登山', evidence: '主动分享最近走过的步道，还问你常去哪里', round: 2 },
    { concern: '个性慢热', evidence: '说话节奏不急，会先接住你的话', round: 3 },
  ],
}

const AN_OUTLINE = {
  topics: ['登山'],
  fits: ['对方的秘密理由'],
  frictions: [],
  highlights: ['对方视角的亮点'],
  fit_points: [{ concern: '小安在意的点', evidence: '对方视角的理由', round: 1 }],
}

interface Harness {
  conv?: ConversationRow | null
  /** runTwinRounds 跑完後把對話改成這個樣子（模擬聊到一半被結束或被本人接手）。 */
  statusAfterRun?: ConversationRow['status']
  convAfterRun?: Partial<ConversationRow>
  scores?: (ScoreRow & { perspective: string })[]
  attempts?: (AttemptRow & { user_id: string })[]
  run?: (id: string, rounds: number) => Promise<{ roundCount: number; ended: boolean }>
}

function harness(opts: Harness = {}) {
  let row = opts.conv === undefined ? conv() : opts.conv
  const messages = [msg(1, ME), msg(2, AN), msg(3, ME), msg(4, AN), msg(5, ME)]
  const scores = opts.scores ?? [
    { perspective: ME, round: 8, direction_score: 82, verdict: 'suitable' as const },
    { perspective: AN, round: 8, direction_score: 40, verdict: 'unsuitable' as const },
  ]
  const attempts = opts.attempts ?? [
    { user_id: ME, result: 'mutual', outline: MY_OUTLINE },
    { user_id: AN, result: 'mutual', outline: AN_OUTLINE },
  ]
  const logs: AgentLogInput[] = []
  const store: ResultStore = {
    getConversation: async (id) => (row && row.id === id ? { ...row } : null),
    getDisplayName: async (id) => (id === AN ? '小安' : '我'),
    listMessages: async () => [...messages],
    listMyScores: vi.fn(async (_c: string, perspective: string, limit: number) =>
      scores.filter((s) => s.perspective === perspective).slice(0, limit),
    ),
    getMyLatestAttempt: vi.fn(async (_c: string, userId: string) => {
      const a = attempts.find((x) => x.user_id === userId)
      return a ? { result: a.result, outline: a.outline } : null
    }),
    resumeConversation: vi.fn(async () => {
      if (row?.status === 'waiting_human') row = { ...row, status: 'active' }
    }),
    // 和 Supabase 版相同的條件：active 且雙方都是分身才改
    pauseConversation: vi.fn(async () => {
      if (row?.status === 'active' && row.side_a_controller === 'twin' && row.side_b_controller === 'twin') {
        row = { ...row, status: 'waiting_human' }
      }
    }),
  }
  const defaultRun = async () => {
    if (row && opts.statusAfterRun) row = { ...row, status: opts.statusAfterRun }
    if (row && opts.convAfterRun) row = { ...row, ...opts.convAfterRun }
    return { roundCount: 12, ended: opts.statusAfterRun === 'ended' }
  }
  const runTwinRounds = vi.fn(opts.run ?? defaultRun)
  const api = createResultApi({
    store,
    runTwinRounds,
    writeLog: async (e) => {
      logs.push(e)
    },
    roundsPerStep: 4,
    maxRounds: 16,
  })
  return { api, store, runTwinRounds, logs, current: () => row }
}

describe('withRounds：第 n 輪＝依時間排序的第 2n−1、2n 則（和 B5 評審的逐輪格式一致）', () => {
  it('第 1、2 則是第 1 輪，第 3、4 則是第 2 輪，第 5 則是第 3 輪', () => {
    const rounds = withRounds([msg(1, ME), msg(2, AN), msg(3, ME), msg(4, AN), msg(5, ME)]).map((m) => m.round)
    expect(rounds).toEqual([1, 1, 2, 2, 3])
  })

  it('不改原本的訊息物件', () => {
    const input = [msg(1, ME)]
    withRounds(input)
    expect(input[0]).not.toHaveProperty('round')
  })
})

describe('parseOutline', () => {
  it('完整的大綱照原樣讀出，fit_points 最多 3 點', () => {
    const many = { ...MY_OUTLINE, fit_points: [1, 2, 3, 4].map((n) => ({ concern: `点${n}`, evidence: '表现', round: n })) }
    const parsed = parseOutline(many)
    expect(parsed?.topics).toEqual(['登山', '摄影'])
    expect(parsed?.fit_points).toHaveLength(3)
  })

  it('不是物件 → null；欄位缺少或格式錯 → 該欄位變成空陣列', () => {
    expect(parseOutline(null)).toBeNull()
    expect(parseOutline('坏掉的')).toBeNull()
    const parsed = parseOutline({ topics: '不是阵列', fit_points: [{ concern: '缺 evidence' }] })
    expect(parsed).toEqual({ topics: [], fits: [], frictions: [], highlights: [], fit_points: [] })
  })
})

describe('getResult', () => {
  it('雙向合適：mutual = true，判定是我方視角，大綱與為什麼你們合是我那一份', async () => {
    const { api } = harness()
    const view = await api.getResult('conv-1', ME)
    expect(view.mutual).toBe(true)
    expect(view.verdict).toEqual({ value: 'suitable', trend: 'flat', score: 82 })
    expect(view.outline).toEqual({ topics: ['登山', '摄影'], fits: ['都喜欢慢慢走'], frictions: ['作息不同'], highlights: ['会主动分享路线'] })
    expect(view.fitPoints).toEqual(MY_OUTLINE.fit_points)
    expect(view.other).toEqual({ userId: AN, name: '小安', controller: 'twin' })
  })

  it('對方打開同一段，看到的是對方自己那一份（兩邊內容不同）', async () => {
    const { api } = harness({ scores: [{ perspective: AN, round: 8, direction_score: 75, verdict: 'suitable' }] })
    const view = await api.getResult('conv-1', AN)
    expect(view.fitPoints).toEqual(AN_OUTLINE.fit_points)
    expect(view.outline?.highlights).toEqual(['对方视角的亮点'])
    expect(view.other.name).toBe('我')
  })

  it('只讀目前登入者自己的 match_attempts 與判定', async () => {
    const { api, store } = harness()
    await api.getResult('conv-1', ME)
    expect(store.getMyLatestAttempt).toHaveBeenCalledWith('conv-1', ME)
    expect(store.listMyScores).toHaveBeenCalledWith('conv-1', ME, expect.any(Number))
    expect(store.getMyLatestAttempt).not.toHaveBeenCalledWith('conv-1', AN)
  })

  // Peter 2026-10-31：結果頁顯示「我方」契合度（verdict.score）；對方視角的分數仍然一律不回
  it('回應裡沒有對方視角的大綱、理由、分數；只有我方的契合度', async () => {
    const { api } = harness()
    const json = JSON.stringify(await api.getResult('conv-1', ME))
    expect(json).not.toContain('对方的秘密理由')
    expect(json).not.toContain('对方视角')
    expect(json).not.toContain('小安在意的点')
    expect(json).not.toMatch(/direction|reason/i)
    expect(json.match(/score/g)).toHaveLength(1)
    expect(json).toContain('"score":82')
    expect(json).not.toContain('40')
  })

  it('不是雙向合適（one_way）→ mutual = false', async () => {
    const { api } = harness({ attempts: [{ user_id: ME, result: 'one_way', outline: MY_OUTLINE }] })
    expect((await api.getResult('conv-1', ME)).mutual).toBe(false)
  })

  it('我方視角不合適 → 不顯示為什麼你們合，大綱照樣給', async () => {
    const { api } = harness({
      scores: [{ perspective: ME, round: 8, direction_score: 30, verdict: 'unsuitable' }],
      attempts: [{ user_id: ME, result: 'unsuitable', outline: { ...MY_OUTLINE, fit_points: MY_OUTLINE.fit_points } }],
    })
    const view = await api.getResult('conv-1', ME)
    expect(view.verdict?.value).toBe('unsuitable')
    expect(view.fitPoints).toEqual([])
    expect(view.outline?.topics).toEqual(['登山', '摄影'])
  })

  it('還沒有判定和紀錄 → verdict、outline 都是 null，對話紀錄照樣給', async () => {
    const { api } = harness({ scores: [], attempts: [] })
    const view = await api.getResult('conv-1', ME)
    expect(view.verdict).toBeNull()
    expect(view.outline).toBeNull()
    expect(view.fitPoints).toEqual([])
    expect(view.mutual).toBe(false)
    expect(view.messages.map((m) => m.round)).toEqual([1, 1, 2, 2, 3])
  })

  it('不是這段對話的人 → 403；對話不存在 → 404', async () => {
    await expect(harness().api.getResult('conv-1', STRANGER)).rejects.toMatchObject({ status: 403 })
    await expect(harness({ conv: null }).api.getResult('conv-1', ME)).rejects.toMatchObject({ status: 404 })
  })

  it('能不能讓分身繼續聊：可以時 continueBlock = null', async () => {
    expect((await harness().api.getResult('conv-1', ME)).continueBlock).toBeNull()
    const ended = await harness({ conv: conv({ status: 'ended' }) }).api.getResult('conv-1', ME)
    expect(ended.continueBlock).toBe('这段对话已经结束了')
  })
})

describe('continueBlock', () => {
  const sides = (c: ConversationRow) => ({
    me: { userId: ME, controller: c.side_a_controller },
    other: { userId: AN, controller: c.side_b_controller },
  })
  const check = (c: ConversationRow) => continueBlock(c, sides(c).me, sides(c).other, 16)

  it('雙方都是分身、等本人、還沒到上限 → 可以', () => {
    expect(check(conv())).toBeNull()
  })

  it('對話還是 active（社交 Agent 在推進）→ 不行，避免和 worker 同時跑', () => {
    expect(check(conv({ status: 'active' }))).toBe('分身正在代聊中，等这一段聊完再说')
  })

  it('對話結束、我已接手、對方本人在聊、到達上限 → 各有原因', () => {
    expect(check(conv({ status: 'ended' }))).toBe('这段对话已经结束了')
    expect(check(conv({ side_a_controller: 'human' }))).toContain('接手')
    expect(check(conv({ side_b_controller: 'human' }))).toContain('对方本人')
    expect(check(conv({ round_count: 16 }))).toContain('16')
  })
})

describe('continueTwin：讓分身繼續聊', () => {
  it('等本人（waiting_human）→ 先改回 active，再跑 ROUNDS_PER_STEP 輪一次，寫日誌', async () => {
    const { api, store, runTwinRounds, logs } = harness()
    let statusDuringRun: string | undefined
    runTwinRounds.mockImplementationOnce(async () => {
      statusDuringRun = (await store.getConversation('conv-1'))?.status
      return { roundCount: 12, ended: false }
    })
    const out = await api.continueTwin('conv-1', ME)
    expect(out).toEqual({ roundCount: 12, ended: false })
    expect(store.resumeConversation).toHaveBeenCalledWith('conv-1')
    expect(statusDuringRun).toBe('active')
    expect(runTwinRounds).toHaveBeenCalledTimes(1)
    expect(runTwinRounds).toHaveBeenCalledWith('conv-1', 4)
    expect(logs[0]).toMatchObject({ user_id: ME, agent: 'twin', conversation_id: 'conv-1', task_id: 'task-1', action: '让分身继续聊' })
  })

  it('對話是 active → 409，不跑代聊、不改狀態', async () => {
    const { api, store, runTwinRounds, current } = harness({ conv: conv({ status: 'active' }) })
    await expect(api.continueTwin('conv-1', ME)).rejects.toMatchObject({ status: 409, message: '分身正在代聊中，等这一段聊完再说' })
    expect(runTwinRounds).not.toHaveBeenCalled()
    expect(store.resumeConversation).not.toHaveBeenCalled()
    expect(current()?.status).toBe('active')
  })

  it('繼續聊完沒結束 → 狀態改回 waiting_human，可以再按一次', async () => {
    const { api, current, runTwinRounds } = harness()
    await api.continueTwin('conv-1', ME)
    expect(current()?.status).toBe('waiting_human')
    await api.continueTwin('conv-1', ME)
    expect(runTwinRounds).toHaveBeenCalledTimes(2)
  })

  it('聊的過程中對話結束了 → 狀態維持 ended，不改', async () => {
    const { api, current } = harness({ statusAfterRun: 'ended' })
    const out = await api.continueTwin('conv-1', ME)
    expect(out.ended).toBe(true)
    expect(current()?.status).toBe('ended')
  })

  it('跑的途中有一方本人接手（controller 變 human、狀態 active）→ 狀態不改，維持 active', async () => {
    for (const side of ['side_a_controller', 'side_b_controller'] as const) {
      const { api, current } = harness({ convAfterRun: { [side]: 'human' } })
      await api.continueTwin('conv-1', ME)
      expect(current()?.status).toBe('active')
      expect(current()?.[side]).toBe('human')
    }
  })

  it('聊到 MAX_ROUNDS（ended = true 但狀態還是 active）→ 改回 waiting_human，不會一直顯示代聊中', async () => {
    const { api, current } = harness({ run: async () => ({ roundCount: 16, ended: true }) })
    await api.continueTwin('conv-1', ME)
    expect(current()?.status).toBe('waiting_human')
  })

  it('不能繼續的情況 → 409，不跑代聊', async () => {
    for (const c of [conv({ status: 'ended' }), conv({ side_a_controller: 'human' }), conv({ round_count: 16 })]) {
      const { api, runTwinRounds } = harness({ conv: c })
      await expect(api.continueTwin('conv-1', ME)).rejects.toMatchObject({ status: 409 })
      expect(runTwinRounds).not.toHaveBeenCalled()
    }
  })

  it('不是這段對話的人 → 403', async () => {
    const { api, runTwinRounds } = harness()
    await expect(api.continueTwin('conv-1', STRANGER)).rejects.toMatchObject({ status: 403 })
    expect(runTwinRounds).not.toHaveBeenCalled()
  })

  it('同一段對話正在繼續聊時再按 → 409，不會同時跑兩次', async () => {
    let release: () => void = () => {}
    let calls = 0
    const done = { roundCount: 12, ended: false }
    const { api, runTwinRounds } = harness({
      // 第一次卡住直到 release()；之後立刻完成
      run: () => (++calls === 1 ? new Promise((resolve) => (release = () => resolve(done))) : Promise.resolve(done)),
    })
    const first = api.continueTwin('conv-1', ME)
    await vi.waitFor(() => expect(runTwinRounds).toHaveBeenCalledTimes(1))
    await expect(api.continueTwin('conv-1', AN)).rejects.toMatchObject({ status: 409 })
    release()
    await first
    // 跑完之後可以再按
    await expect(api.continueTwin('conv-1', ME)).resolves.toBeDefined()
  })

  it('分身出錯 → 503 簡體訊息，寫日誌，狀態改回 waiting_human（之後可以再試）', async () => {
    const { api, logs, current } = harness({ run: async () => Promise.reject(new Error('LLM timeout')) })
    const err = await api.continueTwin('conv-1', ME).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ChatRoomError)
    expect(err).toMatchObject({ status: 503 })
    expect(logs.at(-1)).toMatchObject({ action: '分身继续聊时出错', detail: { error: 'LLM timeout' } })
    expect(current()?.status).toBe('waiting_human')
  })
})
