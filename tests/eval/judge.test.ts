import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { setLlmClient } from '../../server/lib/llm/index.js'
<<<<<<< HEAD
import { NATURALNESS_RUBRIC_SYSTEM, averageScore, judgeMemory, judgeReply, judgeUserMessage, naturalnessScoreSchema } from '../../scripts/eval/judge.js'
=======
import { NATURALNESS_RUBRIC_SYSTEM, averageScore, judgeReply, judgeUserMessage, naturalnessScoreSchema } from '../../scripts/eval/judge.js'
>>>>>>> origin/main

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

const input = {
  persona: '阿澈：温和的朋友，不油腻',
  history: [{ speaker: '用户', content: '今天终于把报告交了' }],
  reply: '恭喜，终于可以松口气了。',
}

describe('自然度評審', () => {
  it('量表是固定文案，含 5 項與人設欄位', () => {
    for (const key of ['catch（接得住）', 'not_interview（不像面试）', 'no_copy（不照抄）', 'persona（人格一致）', 'length（长度合适）', '人设：{{persona}}']) {
      expect(NATURALNESS_RUBRIC_SYSTEM).toContain(key)
    }
  })

  it('用 reason 模型、溫度 0，結果通過 schema；人設和要評的回覆都送給評審', async () => {
    const calls: { model: string; temperature?: number; messages: { role: string; content: string }[] }[] = []
    setLlmClient({
      chat: vi.fn(async (req) => {
        calls.push(req)
        return '{"catch":4,"not_interview":5,"no_copy":5,"persona":4,"length":5,"reason":"接住了交报告这件事"}'
      }),
      embed: vi.fn(async () => [1, 2, 3, 4]),
    })
    const score = await judgeReply(input)
    expect(naturalnessScoreSchema.parse(score)).toEqual(score)
    expect(averageScore(score)).toBeCloseTo(4.6)
    expect(calls[0]!.model).toBe('reason-model')
    expect(calls[0]!.temperature).toBe(0)
    const system = calls[0]!.messages.find(m => m.role === 'system')!.content
    expect(system).toContain('人设：阿澈：温和的朋友，不油腻')
    expect(system).not.toContain('{{persona}}')
    expect(judgeUserMessage(input)).toContain('恭喜，终于可以松口气了。')
  })

<<<<<<< HEAD
  it('可以指定評審模型（和受測的 MODEL_REASON 不同）；記憶語義檢查也一樣', async () => {
    const models: string[] = []
    setLlmClient({
      chat: vi.fn(async (req) => {
        models.push(req.model)
        return req.messages.some(m => m.content.includes('记下的记忆'))
          ? '{"wrong":true,"reason":"把不喜欢记成喜欢"}'
          : '{"catch":4,"not_interview":4,"no_copy":4,"persona":4,"length":4,"reason":"x"}'
      }),
      embed: vi.fn(async () => [1, 2, 3, 4]),
    })
    await judgeReply(input, { model: 'judge-x' })
    const check = await judgeMemory({ userText: '我不喜欢昆虫', memories: ['用户很喜欢昆虫'] }, { model: 'judge-x' })
    await judgeReply(input)
    expect(models).toEqual(['judge-x', 'judge-x', 'reason-model'])
    expect(check.wrong).toBe(true)
  })

=======
>>>>>>> origin/main
  it('分數超出 1～5 不通過 schema', () => {
    expect(naturalnessScoreSchema.safeParse({ catch: 6, not_interview: 4, no_copy: 4, persona: 4, length: 4, reason: 'x' }).success).toBe(false)
  })
})
