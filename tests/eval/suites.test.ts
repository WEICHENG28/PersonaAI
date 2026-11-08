import { describe, expect, it, vi } from 'vitest'
import {
  TWIN_A, TWIN_B, TWIN_CONVERSATION,
  checkMemoryRules, checkProfileInterests, friendTurnContext, memoryTwinStore, runFriendScenario, runTwinScenario,
} from '../../scripts/eval/suites.js'
import type { FriendScenario, TwinScenario } from '../../scripts/eval/scenario.js'

const score = { catch: 4, not_interview: 4, no_copy: 4, persona: 4, length: 4, reason: 'x' }

describe('記憶、檔案題的規則判定', () => {
  it('mustNotContain：去掉空白標點後包含就算記錯', () => {
    expect(checkMemoryRules(['用户 喜欢昆虫。'], { mustNotContain: ['用户喜欢昆虫'] })).toContain('不该出现')
    expect(checkMemoryRules(['用户不喜欢昆虫'], { mustNotContain: ['用户喜欢昆虫'] })).toBeNull()
  })

  it('mustContain 每個都要有；maxCount 是上限', () => {
    expect(checkMemoryRules(['用户喜欢画画'], { mustContain: ['用户喜欢画画', '不喜欢爬山'] })).toContain('少了')
    expect(checkMemoryRules(['用户的室友喜欢猫'], { maxCount: 0 })).toContain('最多 0 条')
    expect(checkMemoryRules([], { maxCount: 0 })).toBeNull()
  })

  it('檔案興趣不能有否定項、要有該有的', () => {
    expect(checkProfileInterests(['登山', '昆虫'], { interestsMustNotInclude: ['昆虫'] })).toContain('昆虫')
    expect(checkProfileInterests(['登山'], { interestsMustNotInclude: ['昆虫'], interestsMustInclude: ['摄影'] })).toContain('摄影')
    expect(checkProfileInterests(['登山', '摄影'], { interestsMustNotInclude: ['昆虫'], interestsMustInclude: ['摄影'] })).toBeNull()
  })
})

const friendScenario: FriendScenario = {
  id: 'friend-find-03', kind: 'friend', tags: ['find'],
  history: [{ role: 'friend', content: '要不要我帮你找几个也喜欢登山的人？' }],
  userText: '好啊', memories: ['用户喜欢登山'], expect: { taskIntent: true },
}

describe('阿澈題組', () => {
  it('題目轉成和正式流程一樣的上下文（最後一則是用戶這句）', () => {
    const ctx = friendTurnContext(friendScenario, { lifeState: '平稳；在家', eventText: null })
    expect(ctx.history.at(-1)).toEqual({ role: 'user', kind: 'chat', content: '好啊' })
    expect(ctx.memories).toBe('- 用户喜欢登山')
    expect(friendTurnContext({ ...friendScenario, memories: [] }, { lifeState: '', eventText: null }).memories).toBe('（还没有长期记忆）')
  })

  it('有預期找人意圖就判對錯；也評分、算問號和照抄', async () => {
    const judge = vi.fn(async () => score)
    const row = await runFriendScenario(friendScenario, {
      generate: async () => ({ reply: '好，我去找找看？', shared_event_id: null, task_intent: false, task_text: null }),
      judge, persona: '阿澈', base: { lifeState: 'x', eventText: null }, copyRefs: ['好，我去找找看'],
    })
    expect(row.pass).toBe(false)
    expect(row.failReason).toContain('找人意图应为 true')
    expect(row.endsWithQuestion).toBe(true)
    expect(row.copySim).toBeGreaterThan(0.6)
    expect(judge.mock.calls[0]![0].reply).toBe('好，我去找找看？')
  })
})

describe('分身題組（記憶體裡的對話，不碰資料庫）', () => {
  const side = (name: string) => ({
    name,
    shareable: { intro: `${name}的介绍`, interests: ['登山'], chat_style: '轻松', looking_for: '朋友' },
    style: { sentence_length: 'short' as const, tone: '轻松', emoji_level: 1 as const, formality: 'casual' as const },
  })
  const scenario: TwinScenario = { id: 'twin-01', kind: 'twin', a: side('甲'), b: side('乙'), openingTopic: '周末去哪', turns: 3 }

  it('A 先說、輪流，最後一則加收尾規則；每則都評分', async () => {
    const store = memoryTwinStore(scenario)
    const reply = vi.fn(async (convId: string, speaker: string) => {
      const n = store.messages.length
      return store.insertMessage({ conversation_id: convId, sender_id: speaker, is_ai: true, guard_rewritten: false, content: `第${n}句` })
    })
    const judge = vi.fn(async () => score)
    const rows = await runTwinScenario(scenario, { reply, store, judge, closingInstruction: '收尾' })
    expect(rows.map(r => r.turn)).toEqual([0, 1, 2])
    expect(reply.mock.calls.map(c => c[1])).toEqual([TWIN_A, TWIN_B, TWIN_A])
    expect(reply.mock.calls[2]![2]).toEqual({ extraInstruction: '收尾' })
    expect(reply.mock.calls[0]![0]).toBe(TWIN_CONVERSATION)
    expect(rows[0]!.context).toBe('（开场话题：周末去哪）')
    expect(rows[1]!.context).toBe('甲：第0句')
    expect(judge).toHaveBeenCalledTimes(3)
  })

  it('記憶體 store：對話設定來自題目，訊息依序存', async () => {
    const store = memoryTwinStore(scenario)
    expect((await store.getConversation(TWIN_CONVERSATION))?.opening_topic).toBe('周末去哪')
    expect(await store.getConversation('other')).toBeNull()
    expect(await store.getDisplayName(TWIN_B)).toBe('乙')
    await store.insertMessage({ conversation_id: TWIN_CONVERSATION, sender_id: TWIN_A, is_ai: true, guard_rewritten: false, content: 'hi' })
    expect(await store.getRecentMessages(TWIN_CONVERSATION, 5)).toHaveLength(1)
  })
})
