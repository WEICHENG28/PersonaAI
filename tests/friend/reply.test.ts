import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { setLlmClient, type LlmClient } from '../../server/lib/llm'
import { CONFIG } from '../../server/lib/config'
import { renderFriendSystem } from '../../server/prompts/01_friend'
import { buildFriendPrompt, generateFriendReply, historyText, type FriendTurnContext } from '../../server/friend/reply'
import { extractMemoryCandidates } from '../../server/friend/memory'

beforeAll(() => {
  Object.assign(process.env, {
    LLM_BASE_URL: 'https://example.test/v1',
    LLM_API_KEY: 'test',
    MODEL_CHAT: 'chat-model',
    MODEL_REASON: 'reason-model',
    MODEL_FAST: 'fast-model',
    MODEL_EMBED: 'embed-model',
    EMBEDDING_DIM: '4',
  })
})

afterEach(() => setLlmClient(null))

function fakeClient(reply: string) {
  const calls: Parameters<LlmClient['chat']>[0][] = []
  setLlmClient({
    chat: vi.fn(async (req) => {
      calls.push(req)
      return reply
    }),
    embed: vi.fn(async () => [1, 2, 3, 4]),
  })
  return calls
}

const ctx: FriendTurnContext = {
  lifeState: '有点累；在整理照片',
  eventText: '今天去看了展',
  recallMemory: null,
  memories: '- 用户喜欢登山',
  history: [
    { role: 'friend', kind: 'chat', content: '最近在忙什么？' },
    { role: 'user', kind: 'chat', content: '在准备考试' },
  ],
  isNudge: false,
  userText: '在准备考试',
}

describe('buildFriendPrompt（N-1：真正的多輪訊息）', () => {
  it('system 由 renderFriendSystem 組出（沒有回憶就不放那段）', () => {
    const { system } = buildFriendPrompt(ctx)
    expect(system).toBe(
      renderFriendSystem({
        lifeState: '有点累；在整理照片',
        eventText: '今天去看了展',
        recallMemory: null,
        memories: '- 用户喜欢登山',
        crisisResource: CONFIG.CRISIS_RESOURCE,
      }),
    )
    expect(system).not.toContain('【这次可以问起的事】')
    expect(system).toContain('【这次可以分享的事】今天去看了展')
  })

  it('阿澈的話是 assistant、用戶是 user，開頭補「（打开聊天）」，最後一則是用戶這句', () => {
    expect(buildFriendPrompt(ctx).messages).toEqual([
      { role: 'user', content: '（打开聊天）' },
      { role: 'assistant', content: '最近在忙什么？' },
      { role: 'user', content: '在准备考试' },
    ])
  })

  it('歷史裡還沒有用戶這句時補在最後；連續的 user 合併', () => {
    const msgs = buildFriendPrompt({ ...ctx, history: [{ role: 'user', kind: 'chat', content: '嗨' }], userText: '在准备考试' }).messages
    expect(msgs).toEqual([{ role: 'user', content: '嗨\n在准备考试' }])
    expect(buildFriendPrompt({ ...ctx, history: [] }).messages).toEqual([{ role: 'user', content: '在准备考试' }])
  })

  it('任務確認卡加標記，模型知道那是卡片', () => {
    const msgs = buildFriendPrompt({
      ...ctx,
      history: [
        { role: 'user', kind: 'chat', content: '帮我找人' },
        { role: 'friend', kind: 'task_card', content: '帮你找 3 位喜欢登山的朋友' },
        { role: 'user', kind: 'chat', content: '好' },
      ],
      userText: '好',
    }).messages
    expect(msgs[1]).toEqual({ role: 'assistant', content: '[任务确认卡] 帮你找 3 位喜欢登山的朋友' })
  })

  it('nudge：最後一則是固定文案「（用户有一阵子没回消息了）」', () => {
    const msgs = buildFriendPrompt({ ...ctx, isNudge: true, history: ctx.history.slice(0, 1) }).messages
    expect(msgs.at(-1)).toEqual({ role: 'user', content: '（用户有一阵子没回消息了）' })
    expect(buildFriendPrompt({ ...ctx, isNudge: true, history: [] }).messages).toEqual([{ role: 'user', content: '（用户有一阵子没回消息了）' }])
  })

  it('historyText 仍給評測、日誌用', () => {
    expect(historyText(ctx.history)).toBe('阿澈：最近在忙什么？\n用户：在准备考试')
  })
})

describe('renderFriendSystem（N-1 固定文案）', () => {
  const base = { lifeState: '平稳；在家', memories: '（还没有长期记忆）', crisisResource: '热线' }
  it('不含舊範例和未替換的佔位符；含新的說話方式', () => {
    const sys = renderFriendSystem({ ...base, eventText: '看展', recallMemory: '周末去漫展' })
    for (const bad of ['鉤', '骰子王', '{{']) expect(sys).not.toContain(bad)
    expect(sys).toContain('你最近两次回复都以问题结尾的话，这次不要再问。')
    expect(sys).toContain('【这次可以问起的事】之前用户提过：周末去漫展。')
    expect(sys).toContain('【主动接话】如果最后一条用户消息是「（用户有一阵子没回消息了）」')
  })

  it('沒有事件、沒有回憶時，兩段都省略', () => {
    const sys = renderFriendSystem({ ...base, eventText: null, recallMemory: null })
    expect(sys).not.toContain('这次可以分享的事')
    expect(sys).not.toContain('这次可以问起的事')
  })

  it('值裡的 $ 不會被當成取代語法', () => {
    expect(renderFriendSystem({ ...base, eventText: '花了 $& 元', recallMemory: null })).toContain('花了 $& 元')
  })
})

describe('generateFriendReply', () => {
  it('用 chat 模型、前景預算，回傳通過 schema 的回覆', async () => {
    const calls = fakeClient('{"reply":"加油！","shared_event_id":null,"task_intent":false}')
    const reply = await generateFriendReply(ctx)
    expect(reply).toEqual({ reply: '加油！', shared_event_id: null, task_intent: false, task_text: null })
    expect(calls[0]!.model).toBe('chat-model')
    expect(calls[0]!.temperature).toBe(0.8)
  })
})

describe('extractMemoryCandidates（不碰資料庫）', () => {
  it('把最近對話和已有記憶放進 prompt，回傳候選記憶', async () => {
    const calls = fakeClient('{"memories":[{"content":"用户在准备考试","confidence":0.9}]}')
    const out = await extractMemoryCandidates({
      userText: '在准备考试',
      recent: [
        { role: 'friend', content: '最近在忙什么？' },
        { role: 'user', content: '在准备考试' },
      ],
      existing: ['用户喜欢登山'],
    })
    expect(out).toEqual([{ content: '用户在准备考试', confidence: 0.9 }])
    expect(calls[0]!.model).toBe('fast-model')
    const system = calls[0]!.messages.find(m => m.role === 'system')?.content ?? ''
    expect(system).toContain('阿澈：最近在忙什么？\n用户：在准备考试')
    expect(system).toContain('- 用户喜欢登山')
  })

  it('沒有已有記憶時寫「（无）」', async () => {
    const calls = fakeClient('{"memories":[]}')
    await extractMemoryCandidates({ userText: '哈哈', recent: [], existing: [] })
    expect(calls[0]!.messages.find(m => m.role === 'system')?.content).toContain('（无）')
  })
})
