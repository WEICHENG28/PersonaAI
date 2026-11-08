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

describe('buildFriendPrompt（E-1：保持原本的壓平格式）', () => {
  it('system 和原本 chat.ts 組出來的一樣（沒有回憶時填「无」）', () => {
    const { system } = buildFriendPrompt(ctx)
    expect(system).toBe(
      renderFriendSystem({
        lifeState: '有点累；在整理照片',
        eventText: '今天去看了展',
        recallMemory: '无',
        memories: '- 用户喜欢登山',
        crisisResource: CONFIG.CRISIS_RESOURCE,
      }),
    )
    expect(buildFriendPrompt({ ...ctx, eventText: null }).system).toContain('无')
  })

  it('整段對話壓成一則 user 訊息', () => {
    expect(buildFriendPrompt(ctx).messages).toEqual([{ role: 'user', content: '阿澈：最近在忙什么？\n用户：在准备考试' }])
  })

  it('沒有歷史時用用戶這句話', () => {
    expect(buildFriendPrompt({ ...ctx, history: [] }).messages[0]!.content).toBe('在准备考试')
  })

  it('nudge：加上主動接話的說明，沒有紀錄時寫「还没有聊天记录」', () => {
    const nudge = buildFriendPrompt({ ...ctx, isNudge: true }).messages[0]!.content
    expect(nudge.startsWith('[mode: nudge] 用户停止回复了一段时间')).toBe(true)
    expect(nudge.endsWith(historyText(ctx.history))).toBe(true)
    expect(buildFriendPrompt({ ...ctx, isNudge: true, history: [] }).messages[0]!.content).toContain('（还没有聊天记录）')
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
