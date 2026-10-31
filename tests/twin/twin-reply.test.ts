// C1 分身回覆 twinReply：Prompt 5 渲染、主流程（LLM、資料庫、守門、日誌全部用假的）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentLogInput, GuardResult, ShareableProfile, StyleProfile } from '../../shared/types'
import { renderTwinSystem, twinReplySchema } from '../../server/prompts/05_twin'
import {
  createTwinReply,
  formatRecentMessages,
  TwinError,
  TWIN_RECENT_LIMIT,
  type TwinConversation,
  type TwinDeps,
  type TwinMessageRow,
  type TwinStore,
} from '../../server/twin/twin'

const AN = 'user-an'
const ZHE = 'user-zhe'

const anShareable: ShareableProfile = {
  intro: '周末去郊区爬山，顺便拍照',
  interests: ['登山', '摄影', '看展'],
  chat_style: '慢热，熟了会分享很多照片和小发现',
  looking_for: '可以一起慢慢爬山、不赶行程的山友',
}
const anStyle: StyleProfile = { sentence_length: 'short', tone: '温和、平静', emoji_level: 1, formality: 'casual' }

function conversation(overrides: Partial<TwinConversation> = {}): TwinConversation {
  return {
    id: 'conv-1',
    status: 'active',
    side_a: AN,
    side_b: ZHE,
    side_a_controller: 'twin',
    side_b_controller: 'twin',
    opening_topic: '最近爬过的山',
    task_id: 'task-1',
    ...overrides,
  }
}

function message(i: number, sender: string): TwinMessageRow {
  return { sender_id: sender, content: `第${i}则`, created_at: `2026-10-30T10:00:${String(i).padStart(2, '0')}Z` }
}

interface Harness {
  deps: TwinDeps
  inserted: Parameters<TwinStore['insertMessage']>[0][]
  logs: AgentLogInput[]
  llm: ReturnType<typeof vi.fn>
  guard: ReturnType<typeof vi.fn>
  getRecent: ReturnType<typeof vi.fn>
}

function harness(opts: {
  conv?: TwinConversation | null
  recent?: TwinMessageRow[]
  llmOut?: { message: string; ask_human: boolean }
  guardOut?: GuardResult
  shareable?: ShareableProfile | null
  style?: StyleProfile | null
} = {}): Harness {
  const inserted: Harness['inserted'] = []
  const logs: AgentLogInput[] = []
  const llm = vi.fn(async () => opts.llmOut ?? { message: '我也喜欢爬山。', ask_human: false })
  const guard = vi.fn(async (text: string) => opts.guardOut ?? { ok: true, text, issues: [] })
  const getRecent = vi.fn(async (_id: string, limit: number) => (opts.recent ?? []).slice(-limit))
  const store: TwinStore = {
    getConversation: async () => (opts.conv === undefined ? conversation() : opts.conv),
    getDisplayName: async (id) => (id === AN ? '小安' : '阿哲'),
    getRecentMessages: getRecent,
    insertMessage: async (row) => {
      inserted.push(row)
      return { id: 'msg-new', created_at: '2026-10-30T10:01:00Z', ...row }
    },
  }
  const deps: TwinDeps = {
    store,
    getShareableProfile: async () => (opts.shareable === undefined ? anShareable : opts.shareable),
    getStyleProfile: async () => (opts.style === undefined ? anStyle : opts.style),
    guardText: guard,
    llmJson: llm as unknown as TwinDeps['llmJson'],
    writeLog: async (entry) => {
      logs.push(entry)
    },
  }
  return { deps, inserted, logs, llm, guard, getRecent }
}

describe('renderTwinSystem（Prompt 5）', () => {
  it('填入名字、對外檔案、風格、開場話題、最近對話，沒有殘留的 {{ }}', () => {
    const system = renderTwinSystem({
      name: '小安',
      shareable: anShareable,
      style: anStyle,
      openingTopic: '最近爬过的山',
      recentMessages: '对方：你好',
    })
    expect(system).toContain('「小安」的分身')
    expect(system).toContain('登山、摄影、看展')
    expect(system).toContain('句长：短')
    expect(system).toContain('语气：温和、平静')
    expect(system).toContain('emoji 程度：1/3')
    expect(system).toContain('正式程度：随意')
    expect(system).toContain('开场话题：最近爬过的山')
    expect(system).toContain('对方：你好')
    expect(system).toContain('用简体中文回复')
    expect(system).not.toMatch(/\{\{|\}\}/)
  })

  it('有收尾指示時放進規則，沒有時不留空白佔位', () => {
    const base = { name: '小安', shareable: anShareable, style: anStyle, openingTopic: 'x', recentMessages: 'y' }
    expect(renderTwinSystem({ ...base, extraInstruction: '- 这是最后一则消息，请礼貌地结束对话。' })).toContain('礼貌地结束对话')
    expect(renderTwinSystem(base)).not.toContain('结束对话')
  })
})

describe('twinReplySchema', () => {
  it('ask_human 沒給時預設 false；空訊息不通過', () => {
    expect(twinReplySchema.parse({ message: '好呀' })).toEqual({ message: '好呀', ask_human: false })
    expect(twinReplySchema.safeParse({ message: '  ', ask_human: false }).success).toBe(false)
  })
})

describe('formatRecentMessages', () => {
  it('自己說的標「我」，對方標「对方」，依時間順序', () => {
    const text = formatRecentMessages([message(1, ZHE), message(2, AN)], AN)
    expect(text).toBe('对方：第1则\n我：第2则')
  })

  it('沒有訊息時說明自己是第一個說話的人', () => {
    expect(formatRecentMessages([], AN)).toContain('第一个说话')
  })
})

describe('twinReply', () => {
  let h: Harness
  let h2: Harness

  beforeEach(() => {
    h = harness()
  })

  it('用對外檔案與風格呼叫 Prompt 5（MODEL_CHAT、temperature 0.8）', async () => {
    await createTwinReply(h.deps)('conv-1', AN)
    expect(h.llm).toHaveBeenCalledTimes(1)
    const call = h.llm.mock.calls[0]![0] as { role: string; temperature: number; system: string }
    expect(call.role).toBe('chat')
    expect(call.temperature).toBe(0.8)
    expect(call.system).toContain('「小安」的分身')
    expect(call.system).toContain('温和、平静')
  })

  it('長對話（16 輪、32 則）時，第一則訊息仍在 Prompt 裡；超過整場的才捨去', async () => {
    const recent = Array.from({ length: 34 }, (_, i) => message(i + 1, i % 2 === 0 ? ZHE : AN))
    h = harness({ recent })
    await createTwinReply(h.deps)('conv-1', AN)
    expect(TWIN_RECENT_LIMIT).toBe(32)
    expect(h.getRecent).toHaveBeenCalledWith('conv-1', 32)
    const system = (h.llm.mock.calls[0]![0] as { system: string }).system
    expect(system).not.toContain('第2则')
    expect(system).toContain('对方：第3则')
    expect(system).toContain('我：第4则')
    expect(system).toContain('对方：第33则')
    expect(system).toContain('我：第34则')
  })

  it('訊息先過隱私守門，寫入的是守門後的版本，is_ai = true', async () => {
    const msg = await createTwinReply(h.deps)('conv-1', AN)
    expect(h.guard).toHaveBeenCalledWith('我也喜欢爬山。', AN)
    expect(h.inserted).toEqual([
      { conversation_id: 'conv-1', sender_id: AN, is_ai: true, guard_rewritten: false, content: '我也喜欢爬山。' },
    ])
    expect(msg).toEqual({
      id: 'msg-new',
      conversation_id: 'conv-1',
      sender_id: AN,
      is_ai: true,
      content: '我也喜欢爬山。',
      created_at: '2026-10-30T10:01:00Z',
    })
  })

  it('守門改寫時寫入改寫版本，guard_rewritten = true', async () => {
    h = harness({
      llmOut: { message: '我在XX大学读书', ask_human: false },
      guardOut: { ok: false, text: '我在读书', issues: ['提到具体学校名称'] },
    })
    const msg = await createTwinReply(h.deps)('conv-1', AN)
    expect(h.inserted[0]).toMatchObject({ content: '我在读书', guard_rewritten: true })
    expect(msg.content).toBe('我在读书')
  })

  it('一般發言不寫日誌（開場由 C3「开始代聊」寫，守門改寫由 C2 寫），不洗版', async () => {
    await createTwinReply(h.deps)('conv-1', AN)
    h2 = harness({ recent: [message(1, ZHE)] })
    await createTwinReply(h2.deps)('conv-1', AN)
    const rewritten = harness({ guardOut: { ok: false, text: '我在读书', issues: ['学校'] } })
    await createTwinReply(rewritten.deps)('conv-1', AN)
    expect([...h.logs, ...h2.logs, ...rewritten.logs]).toEqual([])
  })

  it('ask_human = true 時只寫一筆「需要问本人」的日誌', async () => {
    h = harness({ recent: [message(1, ZHE)], llmOut: { message: '这个我要问一下本人哦', ask_human: true } })
    await createTwinReply(h.deps)('conv-1', AN)
    expect(h.logs).toEqual([
      expect.objectContaining({
        user_id: AN,
        agent: 'twin',
        action: '需要问本人',
        reason: '对方问到个人信息或要约定时间地点，回复要问本人',
        conversation_id: 'conv-1',
        task_id: 'task-1',
        detail: { message_id: 'msg-new' },
      }),
    ])
  })

  it('有收尾指示時傳進 Prompt', async () => {
    await createTwinReply(h.deps)('conv-1', AN, { extraInstruction: '- 这是最后一则消息，请礼貌地结束对话。' })
    const call = h.llm.mock.calls[0]![0] as { system: string; messages: { content: string }[] }
    expect(call.system).toContain('礼貌地结束对话')
    expect(call.messages[0]!.content).toContain('这一则特别注意：这是最后一则消息，请礼貌地结束对话。')
  })

  it('沒有額外規則時，輪到你說話的提示不變', async () => {
    await createTwinReply(h.deps)('conv-1', AN)
    expect((h.llm.mock.calls[0]![0] as { messages: { content: string }[] }).messages[0]!.content).toBe('轮到你说下一则消息了，只输出 JSON。')
  })

  it('沒有對外檔案時不發言', async () => {
    h = harness({ shareable: null })
    await expect(createTwinReply(h.deps)('conv-1', AN)).rejects.toBeInstanceOf(TwinError)
    expect(h.llm).not.toHaveBeenCalled()
    expect(h.inserted).toHaveLength(0)
  })

  it('沒有風格設定時用預設風格，照常發言', async () => {
    h = harness({ style: null })
    await createTwinReply(h.deps)('conv-1', AN)
    expect((h.llm.mock.calls[0]![0] as { system: string }).system).toContain('句长：中等')
  })

  it('對話不存在、說話者不是對話的一方、或該方由本人在聊時丟錯，不呼叫 LLM、不寫入', async () => {
    const missing = harness({ conv: null })
    await expect(createTwinReply(missing.deps)('conv-x', AN)).rejects.toBeInstanceOf(TwinError)
    await expect(createTwinReply(h.deps)('conv-1', 'user-other')).rejects.toBeInstanceOf(TwinError)
    const human = harness({ conv: conversation({ side_a_controller: 'human' }) })
    await expect(createTwinReply(human.deps)('conv-1', AN)).rejects.toBeInstanceOf(TwinError)
    for (const x of [missing, h, human]) {
      expect(x.llm).not.toHaveBeenCalled()
      expect(x.inserted).toHaveLength(0)
    }
  })

  it('對話已結束時丟錯，不呼叫 LLM、不寫入', async () => {
    h = harness({ conv: conversation({ status: 'ended' }) })
    await expect(createTwinReply(h.deps)('conv-1', AN)).rejects.toThrow('这段对话已经结束')
    expect(h.llm).not.toHaveBeenCalled()
    expect(h.inserted).toHaveLength(0)
  })

  it('等待本人（waiting_human）時分身照常發言', async () => {
    h = harness({ conv: conversation({ status: 'waiting_human' }) })
    const msg = await createTwinReply(h.deps)('conv-1', AN)
    expect(h.llm).toHaveBeenCalledTimes(1)
    expect(h.inserted).toHaveLength(1)
    expect(msg.content).toBe('我也喜欢爬山。')
  })

  it('LLM 失敗時錯誤往外丟，不寫入訊息', async () => {
    h.llm.mockRejectedValueOnce(new Error('timeout'))
    await expect(createTwinReply(h.deps)('conv-1', AN)).rejects.toThrow('timeout')
    expect(h.inserted).toHaveLength(0)
  })

  describe('重複句防呆', () => {
    const said = (content: string, i: number): TwinMessageRow => ({
      sender_id: AN,
      content,
      created_at: `2026-10-30T10:00:${String(i).padStart(2, '0')}Z`,
    })
    const other = (content: string, i: number): TwinMessageRow => ({ ...said(content, i), sender_id: ZHE })

    it('和自己最近 3 則幾乎一樣（只差標點）時重新產生一次，寫入第二次的版本', async () => {
      h = harness({
        recent: [said('咖啡确实是我露营时不会漏掉的东西！', 1), other('那你都怎么煮？', 2)],
      })
      h.llm
        .mockResolvedValueOnce({ message: '咖啡确实是我露营时不会漏掉的东西～', ask_human: false })
        .mockResolvedValueOnce({ message: '我没有特别固定的煮法，比较喜欢简单的挂耳。', ask_human: false })
      const msg = await createTwinReply(h.deps)('conv-1', AN)
      expect(h.llm).toHaveBeenCalledTimes(2)
      const retry = h.llm.mock.calls[1]![0] as { messages: { content: string }[] }
      expect(retry.messages[0]!.content).toContain('「咖啡确实是我露营时不会漏掉的东西！」几乎一样')
      expect(h.guard).toHaveBeenCalledTimes(1)
      expect(h.guard).toHaveBeenCalledWith('我没有特别固定的煮法，比较喜欢简单的挂耳。', AN)
      expect(h.inserted).toHaveLength(1)
      expect(msg.content).toBe('我没有特别固定的煮法，比较喜欢简单的挂耳。')
    })

    it('收尾時重生，收尾指示和「不要重複」都會帶上', async () => {
      h = harness({ recent: [said('我真的完全不拍照的啦', 1), other('好吧', 2)] })
      h.llm
        .mockResolvedValueOnce({ message: '我真的完全不拍照的啦。', ask_human: false })
        .mockResolvedValueOnce({ message: '今天聊得很开心，下次再聊～', ask_human: false })
      await createTwinReply(h.deps)('conv-1', AN, { extraInstruction: '- 这是最后一则消息，请礼貌地结束对话。' })
      const retry = (h.llm.mock.calls[1]![0] as { messages: { content: string }[] }).messages[0]!.content
      expect(retry).toContain('这是最后一则消息')
      expect(retry).toContain('不要重复')
    })

    it('對方說過的話不算重複；自己很多輪前說過的話仍然算', async () => {
      h = harness({ recent: [other('我周末想去看日出', 1)] })
      h.llm.mockResolvedValueOnce({ message: '我周末想去看日出', ask_human: false })
      await createTwinReply(h.deps)('conv-1', AN)
      expect(h.llm).toHaveBeenCalledTimes(1)

      const long = Array.from({ length: 20 }, (_, i) => (i % 2 ? said(`第${i}则不一样的话题内容`, i) : other(`对方第${i}则`, i)))
      h = harness({ recent: [said('我不常在外过夜，通常傍晚前就回去了。', 0), ...long] })
      h.llm.mockResolvedValueOnce({ message: '我不常在外过夜，通常傍晚前就回家了！', ask_human: false })
      await createTwinReply(h.deps)('conv-1', AN)
      expect(h.llm).toHaveBeenCalledTimes(2)
    })

    it('長訊息裡有一句重複自己說過的句子（實跑：「我通常带一点简单的轻食」隔 6 輪又說）也重新產生', async () => {
      h = harness({ recent: [said('我通常带一点简单的轻食。你平时去户外的话，会特别注意防晒吗？', 1), other('会呀', 2)] })
      h.llm
        .mockResolvedValueOnce({ message: '我通常带一点简单的轻食。远处的风景和近处的花草，你比较常拍哪一种？', ask_human: false })
        .mockResolvedValueOnce({ message: '我比较喜欢拍近处的花草，光影很细。', ask_human: false })
      const msg = await createTwinReply(h.deps)('conv-1', AN)
      expect(h.llm).toHaveBeenCalledTimes(2)
      expect((h.llm.mock.calls[1]![0] as { messages: { content: string }[] }).messages[0]!.content).toContain('「我通常带一点简单的轻食。」')
      expect(msg.content).toBe('我比较喜欢拍近处的花草，光影很细。')
    })

    it('Prompt 列出自己問過的問題，提醒不要再問同類的', async () => {
      h = harness({ recent: [said('我挺喜欢看展的。你看展的话，比较喜欢美术馆还是博物馆？', 1), other('我不常看展耶', 2)] })
      await createTwinReply(h.deps)('conv-1', AN)
      const system = (h.llm.mock.calls[0]![0] as { system: string }).system
      expect(system).toContain('你已经问过的问题')
      expect(system).toContain('- 你看展的话，比较喜欢美术馆还是博物馆？')
      expect(system).not.toContain('- 我不常看展耶')
    })

    it('一直重複同一個口頭禪（最近 3 則有 2 則說過）時也重新產生', async () => {
      h = harness({ recent: [said('想到高海拔就完全停不下来！', 1), said('上山就完全停不下来～', 2), other('哈哈', 3)] })
      h.llm
        .mockResolvedValueOnce({ message: '越野跑让我完全停不下来！', ask_human: false })
        .mockResolvedValueOnce({ message: '你平时拍照喜欢拍什么？', ask_human: false })
      const msg = await createTwinReply(h.deps)('conv-1', AN)
      expect((h.llm.mock.calls[1]![0] as { messages: { content: string }[] }).messages[0]!.content).toContain('「完全停不下来」')
      expect(msg.content).toBe('你平时拍照喜欢拍什么？')
    })

    it('第二次還重複其中一句時拿掉那一句；整則都是重複就照用，不無限重試', async () => {
      h = harness({ recent: [said('你平时拍照通常都用什么设备？', 1), other('手机', 2)] })
      h.llm
        .mockResolvedValueOnce({ message: '你平时拍照通常都用什么设备？', ask_human: false })
        .mockResolvedValueOnce({ message: '早晨空气比较好，光线也适合拍照。你平时拍照通常都用什么设备？', ask_human: false })
      const msg = await createTwinReply(h.deps)('conv-1', AN)
      expect(h.llm).toHaveBeenCalledTimes(2)
      expect(msg.content).toBe('早晨空气比较好，光线也适合拍照。')

      h = harness({ recent: [said('我也喜欢爬山。', 1)] })
      const same = await createTwinReply(h.deps)('conv-1', AN)
      expect(h.llm).toHaveBeenCalledTimes(2)
      expect(same.content).toBe('我也喜欢爬山。')
    })
  })
})
