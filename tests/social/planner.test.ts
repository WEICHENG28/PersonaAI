import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentTask, Evaluation, LobbyCandidate } from '../../shared/types'
import { setLlmClient } from '../../server/lib/llm'
import { setLogWriter } from '../../server/lib/log'
import { MemoryAgentStore } from '../../server/social/agentStore'
import { chooseOpeningTopic, cleanReason, decide, pick, type PlannerContext } from '../../server/social/planner'

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

const task: AgentTask = {
  id: 't1',
  user_id: 'me',
  kind: 'search',
  raw_instruction: '帮我找 3 个喜欢登山的人聊聊',
  restatement: '帮你找 3 位喜欢登山的运动伙伴',
  purpose: 'sport',
  conditions: ['喜欢登山'],
  target_count: 3,
  done_condition: { suitable_count: 2, max_chats: 6 },
  target_user_id: null,
  status: 'running',
  progress: { screened: 3, chats: 1, suitable: 0 },
  active_conversation_id: null,
  attempted_user_ids: [],
}

const cand = (id: string, similarity: number, interests = ['登山']): LobbyCandidate => ({
  user_id: id,
  display_name: id,
  shareable: { intro: '', interests, chat_style: '', looking_for: '' },
  similarity,
})
const candidates = [cand('azhe', 0.74), cand('xiaoan', 0.71, ['登山', '摄影'])]

let prompts: string[]
let ctx: PlannerContext

/** 依序回傳 replies（物件會轉成 JSON 字串；Error 會丟出）。 */
function fakeModel(...replies: (unknown | Error)[]) {
  setLlmClient({
    async chat(req) {
      prompts.push(req.messages.map((m) => m.content).join('\n'))
      const next = replies.length > 1 ? replies.shift() : replies[0]
      if (next instanceof Error) throw next
      return JSON.stringify(next)
    },
    embed: async () => [],
  })
}

beforeEach(() => {
  prompts = []
  setLogWriter(async () => {})
  ctx = {
    store: new MemoryAgentStore(),
    getShareableProfile: vi.fn(async () => ({ intro: '', interests: ['登山', '摄影'], chat_style: '', looking_for: '' })),
    getAgentProfile: vi.fn(async () => ({
      big_five: { O: { score: 70, confidence: 0.6, evidence: '' }, C: { score: 50, confidence: 0.6, evidence: '' }, E: { score: 30, confidence: 0.6, evidence: '' }, A: { score: 80, confidence: 0.6, evidence: '' }, N: { score: 40, confidence: 0.6, evidence: '' } },
      values: ['真诚'],
      style: { sentence_length: 'short' as const, tone: '温和', emoji_level: 1 as const, formality: 'casual' as const },
    })),
  }
})

afterEach(() => {
  setLlmClient(null)
  setLogWriter(null)
  vi.restoreAllMocks()
})

const start = (id: string, reason = '对方也慢热，喜欢边爬山边拍照') => ({
  tool: 'start_conversation',
  args: { target_user_id: id, opening_topic: '最近去登山拍到的照片' },
  reason,
})

describe('pick', () => {
  it('選清單裡的人，帶理由與開場話題；輸入有後台檔案、沒有分數數字', async () => {
    fakeModel(start('xiaoan'))
    const r = await pick(task, candidates, ctx)
    expect(r).toMatchObject({ target: { user_id: 'xiaoan' }, reason: '对方也慢热，喜欢边爬山边拍照', openingTopic: '最近去登山拍到的照片' })
    expect(prompts[0]).toContain('后台档案')
    expect(prompts[0]).toContain('摄影')
    expect(prompts[0]).not.toContain('0.71')
  })

  it('選了清單外的人 → 重試一次，第二次合格就用', async () => {
    fakeModel(start('nobody'), start('azhe'))
    expect((await pick(task, candidates, ctx)).target?.user_id).toBe('azhe')
  })

  it('兩次都無效 → 改用相似度最高者並註明', async () => {
    fakeModel(start('nobody'))
    const r = await pick(task, candidates, ctx)
    expect(r).toMatchObject({ target: { user_id: 'azhe' }, reason: '规划器输出无效，改用相似度最高者' })
  })

  it('LLM 沒回應 → 改用相似度最高者，任務不卡住', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fakeModel(new Error('timeout'))
    const r = await pick(task, candidates, ctx)
    expect(r).toMatchObject({ target: { user_id: 'azhe' }, reason: '规划器暂时没有回应，改用相似度最高者' })
  })

  it('選 finish → 不挑人', async () => {
    fakeModel({ tool: 'finish', args: {}, reason: '都不太符合运动伙伴的条件' })
    expect(await pick(task, candidates, ctx)).toEqual({ target: null, reason: '都不太符合运动伙伴的条件' })
  })
})

describe('chooseOpeningTopic（實跑時的「手冲咖啡」問題）', () => {
  it('規劃器用了只有對方有的興趣 → 改用雙方共同的興趣', () => {
    expect(chooseOpeningTopic('露营时手冲咖啡的绝佳搭配', ['登山', '摄影'], ['露营', '登山', '手冲咖啡'], ['喜欢登山'])).toBe('登山')
  })
  it('規劃器的話題有提到我的興趣或任務條件 → 照用', () => {
    expect(chooseOpeningTopic('周末去哪里摄影比较好', ['摄影'], ['摄影'], [])).toBe('周末去哪里摄影比较好')
  })
  it('沒有共同興趣 → 用任務條件', () => {
    expect(chooseOpeningTopic(undefined, ['看书'], ['越野跑'], ['喜欢登山'])).toBe('看书')
    expect(chooseOpeningTopic(undefined, [], ['越野跑'], ['喜欢登山'])).toBe('登山')
  })
})

describe('decide', () => {
  const ev: Evaluation = {
    a: { perspective_user_id: 'me', direction_score: 82, verdict: 'suitable', reason_type: null, reason_text: null, outline: { topics: [], fits: [], frictions: [], highlights: [], fit_points: [] } },
    b: { perspective_user_id: 'xiaoan', direction_score: 76, verdict: 'suitable', reason_type: null, reason_text: null, outline: { topics: [], fits: [], frictions: [], highlights: [], fit_points: [] } },
    round: 8,
  }

  it('回傳工具與理由；輸入只有判定、沒有分數', async () => {
    fakeModel({ tool: 'notify_user', args: {}, reason: '双方都觉得聊得来' })
    expect(await decide(task, ev, ctx)).toEqual({ action: 'notify_user', reason: '双方都觉得聊得来' })
    expect(prompts[0]).not.toContain('82')
    expect(prompts[0]).not.toContain('76')
  })

  it('LLM 沒回應 → 回 null，交給程式規則', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fakeModel(new Error('down'))
    expect(await decide(task, ev, ctx)).toBeNull()
  })
})

describe('cleanReason', () => {
  it('理由出現分數就換成通用說法', () => {
    expect(cleanReason('相似度 0.82，很高', '和任务条件相符')).toBe('和任务条件相符')
    expect(cleanReason('方向分数 85 分', 'x')).toBe('x')
    expect(cleanReason('都喜欢登山，节奏也慢', 'x')).toBe('都喜欢登山，节奏也慢')
  })
})
