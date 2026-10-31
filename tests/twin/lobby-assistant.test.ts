// C10 大廳助手（從 PR #88 搬來）：交辦任務 → B 建任務；其他問題 → searchLobby → Prompt 11 → 回答＋小卡片；
// 回答與卡片都不出現分數（LLM、B 都用假的）。
import { describe, expect, it, vi } from 'vitest'
import type { AgentTask, LobbyCandidate, ShareableProfile } from '../../shared/types'
import { createLobbyApi, type LobbyDeps } from '../../server/twin/lobby'
import { hasScoreNumber, isTaskRequest, pickForQuestion, stripScores } from '../../server/twin/lobbyAssistant'

const ME = 'user-me'
const myProfile: ShareableProfile = { intro: '周末爬山', interests: ['登山', '摄影'], chat_style: '慢热', looking_for: '山友' }

function candidate(id: string, name: string, similarity: number): LobbyCandidate {
  return {
    user_id: id,
    display_name: name,
    similarity,
    shareable: { intro: `${name}的介绍`, interests: ['登山'], chat_style: '直爽', looking_for: '一起爬山' },
  }
}

const AN = candidate('u-an', '小安', 0.66)
const QING = candidate('u-qing', '子晴', 0.55)
const XIA = candidate('u-xia', '夏夏', 0.44)

function harness(over: Partial<LobbyDeps> = {}) {
  const cached = { headline: '卡片介绍', tags: ['登山'], chat_style: '直爽', mbti: null }
  const deps: LobbyDeps = {
    store: {
      getCardRows: vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, { card: cached, self_mbti: null, purposes: [] }]))),
      saveCard: vi.fn(async () => undefined),
      isReadyForTwin: vi.fn(async () => true),
      isInLobby: vi.fn(async () => true),
      findOpenManualChat: vi.fn(async () => null),
    },
    searchLobby: vi.fn(async () => [AN, QING, XIA]),
    getShareableProfile: vi.fn(async () => myProfile),
    createTaskFromText: vi.fn(async () => ({ id: 'task-search' }) as AgentTask),
    createSingleTargetTask: vi.fn(async () => ({ id: 'task-single' }) as AgentTask),
    startConversation: vi.fn(async () => ({ conversationId: 'conv-new' })),
    llmJson: vi.fn(async () => ({ answer: '小安和子晴都爱登山，小安更慢热。', card_user_ids: ['u-qing', 'u-an'] })) as unknown as LobbyDeps['llmJson'],
    ...over,
  }
  return { deps, api: createLobbyApi(deps) }
}

describe('大廳助手 ask', () => {
  it('像交辦任務（帮我找）→ 交給 B 建任務，回 taskId，不呼叫 LLM', async () => {
    const { deps, api } = harness()
    expect(await api.ask(ME, '帮我找 2 个喜欢动漫的人')).toEqual({ kind: 'task', taskId: 'task-search' })
    expect(deps.createTaskFromText).toHaveBeenCalledWith(ME, '帮我找 2 个喜欢动漫的人')
    expect(deps.llmJson).not.toHaveBeenCalled()
  })

  it('其他問題 → 用問題搜尋（先多搜 20 位，取 5 位）→ Prompt 11 → 回答＋模型引用的卡片（照引用順序、沒有預估）', async () => {
    const { deps, api } = harness()
    const view = await api.ask(ME, '谁适合一起爬山？')
    expect(deps.searchLobby).toHaveBeenCalledWith(ME, { text: '谁适合一起爬山？', limit: 20 })
    const call = (deps.llmJson as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { role: string; temperature: number; system: string }
    expect(call.role).toBe('chat')
    expect(call.temperature).toBe(0.5)
    expect(call.system).toContain('id：u-an；名字：小安')
    expect(call.system).toContain('登山、摄影')
    expect(call.system).not.toMatch(/0\.66|similarity/)
    expect(view).toEqual({
      kind: 'answer',
      answer: '小安和子晴都爱登山，小安更慢热。',
      cards: [
        expect.objectContaining({ userId: 'u-qing', headline: '卡片介绍', fit: null }),
        expect.objectContaining({ userId: 'u-an', fit: null }),
      ],
    })
    expect(JSON.stringify(view)).not.toMatch(/0\.\d|similarity/)
  })

  it('問題點名的人即使相似度排在 5 名外，也會給助手參考（「小安和子晴谁比较适合我？」）', async () => {
    const others = ['甲甲', '乙乙', '丙丙', '丁丁', '戊戊', '己己'].map((n, i) => candidate(`u-${i}`, n, 0.8 - i * 0.01))
    const { deps, api } = harness({ searchLobby: vi.fn(async () => [...others, AN, QING]) })
    await api.ask(ME, '小安和子晴谁比较适合我？')
    const system = ((deps.llmJson as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { system: string }).system
    expect(system).toContain('名字：小安')
    expect(system).toContain('名字：子晴')
    expect(system).not.toContain('名字：戊戊')
  })

  it('模型引用的 id 不在候選人裡就忽略；都沒有時附前 3 位', async () => {
    const { api } = harness({
      llmJson: vi.fn(async () => ({ answer: '可以看看这几位。', card_user_ids: ['u-fake'] })) as unknown as LobbyDeps['llmJson'],
    })
    const view = await api.ask(ME, '有推荐的吗')
    expect(view.kind === 'answer' && view.cards.map((c) => c.userId)).toEqual(['u-an', 'u-qing', 'u-xia'])
  })

  it('回答有分數時重問一次；還有就把分數拿掉，畫面不會出現數字分數', async () => {
    const llm = vi
      .fn()
      .mockResolvedValueOnce({ answer: '林小山契合度 82、陈岭 69 分。', card_user_ids: [] })
      .mockResolvedValueOnce({ answer: '小安契合度 82，很适合你。', card_user_ids: [] })
    const { api } = harness({ llmJson: llm as unknown as LobbyDeps['llmJson'] })
    const view = await api.ask(ME, '谁最合？')
    expect(llm).toHaveBeenCalledTimes(2)
    expect((llm.mock.calls[1]![0] as { messages: { content: string }[] }).messages[0]!.content).toContain('不能出现任何分数')
    expect(view.kind === 'answer' && view.answer).toBe('小安，很适合你。')
  })

  it('LLM 失敗 → 503 的簡體訊息', async () => {
    const { api } = harness({ llmJson: vi.fn(async () => Promise.reject(new Error('timeout'))) as unknown as LobbyDeps['llmJson'] })
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(api.ask(ME, '谁适合我？')).rejects.toMatchObject({ status: 503, message: '大厅助手刚才没回上，请再问一次' })
    err.mockRestore()
  })

  it('B 建任務的錯誤（例如還沒開社交 Agent）原樣回給用戶', async () => {
    const e = Object.assign(new Error('先到「我的档案」确认对外档案，并在设置开启社交 Agent'), { name: 'TaskError', status: 403 })
    const { api } = harness({ createTaskFromText: vi.fn(async () => Promise.reject(e)) })
    await expect(api.ask(ME, '帮我找山友')).rejects.toMatchObject({ status: 403, message: e.message })
  })
})

describe('分數偵測', () => {
  it('抓得到契合度、分、百分比、排名、Big Five', () => {
    for (const t of ['契合度 82', '74分', '匹配度：90', '80%', '第 1 名', '提到 Big Five', '大五人格']) {
      expect(hasScoreNumber(t)).toBe(true)
    }
  })

  it('人數、時間、分享不算分數', () => {
    for (const t of ['帮你找了 2 个人', '聊 10 分钟就熟了', '喜欢分享照片', '周末 3 点']) {
      expect(hasScoreNumber(t)).toBe(false)
    }
  })

  it('stripScores 拿掉分數片段', () => {
    expect(stripScores('林小山契合度 82、周予安 74 分，都不错。')).not.toMatch(/\d/)
  })
})

describe('isTaskRequest', () => {
  it('帮我找／帮我约 算交辦任務；一般問題不算', () => {
    expect(isTaskRequest('帮我找 2 个喜欢动漫的人')).toBe(true)
    expect(isTaskRequest('帮我约个山友')).toBe(true)
    expect(isTaskRequest('谁适合一起爬山？')).toBe(false)
  })
})

describe('pickForQuestion', () => {
  it('點名的排前面，其他照順序補滿；點名超過上限時全部保留', () => {
    expect(pickForQuestion([XIA, QING, AN], '小安呢', 2).map((c) => c.display_name)).toEqual(['小安', '夏夏'])
    expect(pickForQuestion([XIA, QING, AN], '小安和子晴还有夏夏', 2)).toHaveLength(3)
  })
})
