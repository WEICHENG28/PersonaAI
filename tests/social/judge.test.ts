import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentLogInput, AgentTask, ChatMessage } from '../../shared/types'
import { setLlmClient } from '../../server/lib/llm'
import { setLogWriter } from '../../server/lib/log'
import { MemoryAgentStore } from '../../server/social/agentStore'
import { aggregateRuns, directionScore, evaluate, formatTranscript, pickOutline, toScoredRun, type JudgeContext, type ScoredRun } from '../../server/social/judge'

beforeAll(() => {
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

const outline = (fit = [{ concern: '喜欢登山', evidence: '他住在大安区，主动分享登山行程', round: 5 }]) => ({
  topics: ['登山'],
  fits: ['节奏都慢'],
  frictions: [],
  highlights: ['会拍照'],
  fit_points: fit,
})
const run = (verdict: ScoredRun['verdict'], score: number, reason: string | null = null): ScoredRun => ({
  direction_score: score,
  verdict,
  reason_type: reason ? 'friction' : null,
  reason_text: reason,
  outline: outline(),
})

describe('directionScore／toScoredRun', () => {
  const scores = { topic_fit: 4, engagement: 4, values: 3, humor: 3, smoothness: 4, condition_fit: 5 }
  it('六項平均 × 20', () => {
    expect(directionScore(scores)).toBe(77)
  })
  it('≥ 70 合適、< 70 不合適、資訊不足為不確定', () => {
    const base = { scores, enough_info: true, reason_type: null, reason_text: null, outline: outline() }
    expect(toScoredRun(base).verdict).toBe('suitable')
    expect(toScoredRun({ ...base, scores: { ...scores, values: 1, humor: 1, smoothness: 2 } }).verdict).toBe('unsuitable')
    expect(toScoredRun({ ...base, enough_info: false }).verdict).toBe('uncertain')
  })
})

describe('B11 找人目的加權', () => {
  const scores = { topic_fit: 4, engagement: 4, values: 4, humor: 1, smoothness: 4, condition_fit: 2 }
  it('交友等權重；讀書加重條件、降低幽默', () => {
    expect(directionScore(scores, 'friend')).toBe(63)
    // study：(4+4+4+0.5×1+4+2×2)/(1+1+1+0.5+1+2) × 20 = 20.5/6.5 × 20
    expect(directionScore(scores, 'study')).toBe(63)
    expect(directionScore({ ...scores, condition_fit: 5, humor: 1 }, 'study')).toBe(82)
    expect(directionScore({ ...scores, condition_fit: 5, humor: 1 }, 'friend')).toBe(73)
  })
  it('同一段對話，目的不同可能判定不同', () => {
    const run = { scores: { topic_fit: 4, engagement: 4, values: 3, humor: 2, smoothness: 4, condition_fit: 2 }, enough_info: true, reason_type: null, reason_text: null, outline: outline() }
    expect(toScoredRun(run, 'friend').verdict).toBe('unsuitable')
    expect(toScoredRun({ ...run, scores: { ...run.scores, condition_fit: 5 } }, 'study').verdict).toBe('suitable')
  })
  it('評審輸入帶上這個目的要多看什麼', async () => {
    const { judgeUser } = await import('../../server/prompts/06_judge')
    expect(judgeUser({ purpose: '读书伙伴', preferences: {}, otherShareable: {}, transcript: '' })).toContain('作息、目标、读书习惯')
  })
})

describe('aggregateRuns', () => {
  it('3 次一致', () => {
    expect(aggregateRuns([run('suitable', 80), run('suitable', 76), run('suitable', 90)])).toMatchObject({ verdict: 'suitable', direction_score: 82 })
  })
  it('2 對 1 取多數，分數取多數那幾次的平均', () => {
    const agg = aggregateRuns([run('suitable', 80), run('unsuitable', 50, '冷场'), run('suitable', 74)])
    expect(agg).toMatchObject({ verdict: 'suitable', direction_score: 77 })
    expect(agg.majority).toHaveLength(2)
  })
  it('2 次不合適也取多數', () => {
    expect(aggregateRuns([run('unsuitable', 50), run('unsuitable', 54), run('suitable', 80)]).verdict).toBe('unsuitable')
  })
  it('3 次都不同 → 不確定；沒有任何結果 → 不確定', () => {
    expect(aggregateRuns([run('suitable', 80), run('unsuitable', 50), run('uncertain', 60)]).verdict).toBe('uncertain')
    expect(aggregateRuns([]).verdict).toBe('uncertain')
  })
})

describe('pickOutline', () => {
  const guard = vi.fn(async (text: string) => ({ ok: false, text: text.replace('他住在大安区，', ''), issues: ['地址'] }))
  it('合適：保留 fit_points，evidence 經隱私守門（守的是對方）', async () => {
    const o = await pickOutline([run('suitable', 80)], 'suitable', 'xiaoan', guard)
    expect(o.fit_points[0]?.evidence).toBe('主动分享登山行程')
    expect(guard).toHaveBeenCalledWith('他住在大安区，主动分享登山行程', 'xiaoan')
  })
  it('不合適：清空 fit_points', async () => {
    expect((await pickOutline([run('unsuitable', 50)], 'unsuitable', 'x', guard)).fit_points).toEqual([])
  })
})

describe('formatTranscript', () => {
  it('雙方各說一次算一輪', () => {
    const m = (id: string, s: string): ChatMessage => ({ id, conversation_id: 'c', sender_id: s, is_ai: true, content: id, created_at: '' })
    expect(formatTranscript([m('嗨', 'me'), m('你好', 'x'), m('爬山吗', 'me')], { me: '小鹿', x: '小安' })).toBe('第1轮 小鹿：嗨\n第1轮 小安：你好\n第2轮 小鹿：爬山吗')
  })
})

describe('evaluate', () => {
  const task: AgentTask = {
    id: 't1', user_id: 'me', kind: 'search', raw_instruction: null, restatement: null, purpose: 'sport', conditions: ['喜欢登山'],
    target_count: 3, done_condition: {}, target_user_id: null, status: 'running', progress: { screened: 0, chats: 1, suitable: 0 },
    active_conversation_id: 'conv-1', attempted_user_ids: ['xiaoan'],
  }
  let store: MemoryAgentStore
  let ctx: JudgeContext
  let logs: AgentLogInput[]
  let prompts: string[]

  beforeEach(() => {
    store = new MemoryAgentStore()
    logs = []
    prompts = []
    setLogWriter(async (e) => {
      logs.push(e)
    })
    ctx = {
      store,
      getTranscript: async () => [{ id: '1', conversation_id: 'conv-1', sender_id: 'me', is_ai: true, content: '最近爬了哪座山？', created_at: '' }],
      getShareableProfile: async () => ({ intro: '爱爬山', interests: ['登山'], chat_style: '慢热', looking_for: '山友' }),
      guardText: async (text) => ({ ok: true, text, issues: [] }),
    }
  })
  afterEach(() => {
    setLlmClient(null)
    setLogWriter(null)
  })

  /** 依視角回不同的分數：「站在 me」→ good，「站在 xiaoan」→ theirs。 */
  function fakeJudge(theirs: number) {
    setLlmClient({
      async chat(req) {
        const sys = req.messages[0]?.content ?? ''
        prompts.push(sys)
        const s = sys.includes('站在「me」') ? 4 : theirs
        const scores = { topic_fit: s, engagement: s, values: s, humor: s, smoothness: s, condition_fit: s }
        return JSON.stringify({ scores, enough_info: true, reason_type: s < 4 ? 'friction' : null, reason_text: s < 4 ? '话题接不上' : null, outline: outline() })
      },
      embed: async () => [],
    })
  }

  it('雙方視角各判 3 次、寫兩筆 match_scores、日誌寫判定摘要', async () => {
    fakeJudge(2)
    const ev = await evaluate(task, 'conv-1', 8, ctx)
    expect(prompts).toHaveLength(6)
    expect(ev.a).toMatchObject({ perspective_user_id: 'me', verdict: 'suitable', direction_score: 80, reason_type: null })
    expect(ev.b).toMatchObject({ perspective_user_id: 'xiaoan', verdict: 'unsuitable', reason_type: 'friction', reason_text: '话题接不上' })
    expect(ev.a.outline.fit_points).toHaveLength(1)
    expect(ev.b.outline.fit_points).toEqual([])
    expect(store.scores.map((r) => r.perspective_user_id)).toEqual(['me', 'xiaoan'])
    expect(store.scores[0]?.runs).toHaveLength(3)
    expect(logs[0]).toMatchObject({ agent: 'judge', action: '第 8 轮：你的视角合适、对方视角不合适' })
    expect(logs[0]?.reason).toContain('3 次判定：3 合适')
  })

  it('評審全部沒回應 → 該視角不確定，不丟錯', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    setLlmClient({ chat: async () => { throw new Error('down') }, embed: async () => [] })
    const ev = await evaluate(task, 'conv-1', 8, ctx)
    expect(ev.a.verdict).toBe('uncertain')
    expect(logs[0]?.reason).toContain('评审暂时没有回应')
  })
})

describe('judgeSchema', () => {
  it('fit_points 放在最外層也收得到', async () => {
    const { judgeSchema } = await import('../../server/prompts/06_judge')
    const scores = { topic_fit: 5, engagement: 5, values: 5, humor: 3, smoothness: 5, condition_fit: 5 }
    const parsed = judgeSchema.parse({ scores, outline: { topics: ['登山'] }, fit_points: [{ concern: '喜欢登山', evidence: '主动分享', round: 3 }] })
    expect(parsed.outline.fit_points).toEqual([{ concern: '喜欢登山', evidence: '主动分享', round: 3 }])
  })
})
