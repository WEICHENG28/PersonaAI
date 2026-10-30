/**
 * A9：娛樂標籤測試。
 * 必測：funLabelSchema 驗證、generateFunLabels 主流程（無 shareable → 拋錯）。
 * A8：editMemory 測試。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { funLabelSchema, renderFunSystem } from '../../server/prompts/12_fun'
import * as supabaseLib from '../../server/lib/supabase'
import * as llmLib from '../../server/lib/llm'
import { setLogWriter } from '../../server/lib/log'
import { memoryContentSchema } from '../../server/friend/memory'

// ── Prompt 12 schema ─────────────────────────────────────────────

describe('funLabelSchema', () => {
  const valid = {
    mbti_guess: 'INFP',
    reason: '内敛但观察细腻',
    report: '（仅供娱乐）你可能有点 INFP',
  }

  it('接受合法的输出', () => {
    expect(funLabelSchema.safeParse(valid).success).toBe(true)
  })

  it('拒絕 report 不以「（仅供娱乐）」開頭', () => {
    expect(funLabelSchema.safeParse({ ...valid, report: 'INFP 是…' }).success).toBe(false)
  })

  it('拒絕無效的 MBTI（長度不足）', () => {
    expect(funLabelSchema.safeParse({ ...valid, mbti_guess: 'INF' }).success).toBe(false)
  })

  it('拒絕無效的 MBTI（錯誤字母）', () => {
    expect(funLabelSchema.safeParse({ ...valid, mbti_guess: 'ABCD' }).success).toBe(false)
  })

  it('接受全部 16 個 MBTI 格式', () => {
    const types = ['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP',
      'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP']
    for (const t of types) {
      expect(funLabelSchema.safeParse({ ...valid, mbti_guess: t }).success).toBe(true)
    }
  })
})

describe('renderFunSystem', () => {
  it('填入 shareable profile JSON', () => {
    const json = '{"intro":"测试"}'
    const sys = renderFunSystem(json)
    expect(sys).toContain('{"intro":"测试"}')
    expect(sys).not.toContain('{{shareable_profile}}')
  })
})

// ── A8: memoryContentSchema ──────────────────────────────────────

describe('memoryContentSchema（A8）', () => {
  it('接受正常內容', () => {
    expect(memoryContentSchema.safeParse('用户喜欢画画').success).toBe(true)
  })

  it('拒絕空字串', () => {
    expect(memoryContentSchema.safeParse('').success).toBe(false)
  })

  it('拒絕超過 200 字的內容', () => {
    expect(memoryContentSchema.safeParse('a'.repeat(201)).success).toBe(false)
  })
})

// ── A8: editMemory 整合 ──────────────────────────────────────────

describe('editMemory', () => {
  let mockDb: any
  let updateData: any

  beforeEach(() => {
    updateData = {
      id: 'm1',
      content: '新内容',
      source: 'user_edited',
      confidence: 1,
      created_at: '2026-01-01',
      deleted_at: null,
    }

    mockDb = {
      from: (_table: string) => ({
        update: (_patch: unknown) => ({
          eq: (_c: string, _v: unknown) => ({
            eq: (_c2: string, _v2: unknown) => ({
              is: (_c3: string, _v3: unknown) => ({
                select: (_cols: string) => ({
                  single: () => Promise.resolve({ data: updateData, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    }

    vi.spyOn(supabaseLib, 'getServiceClient').mockReturnValue(mockDb as any)
    setLogWriter(async () => { })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    supabaseLib.resetServiceClientForTest()
    setLogWriter(null)
  })

  it('回傳更新後的記憶行', async () => {
    const { editMemory } = await import('../../server/friend/memory')
    const result = await editMemory('u1', 'm1', '新内容')
    expect(result).toBeTruthy()
    if (result) {
      expect(result.source).toBe('user_edited')
      expect(result.confidence).toBe(1)
    }
  })

  it('內容空白時回傳 false', async () => {
    const { editMemory } = await import('../../server/friend/memory')
    const result = await editMemory('u1', 'm1', '   ')
    expect(result).toBe(false)
  })

  it('找不到記憶（DB 無行）時回傳 false', async () => {
    mockDb.from = (_table: string) => ({
      update: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: null, error: { message: 'not found' } }),
              }),
            }),
          }),
        }),
      }),
    })
    const { editMemory } = await import('../../server/friend/memory')
    const result = await editMemory('u1', 'm1', '有内容')
    expect(result).toBe(false)
  })
})

// ── A9: generateFunLabels 整合 ───────────────────────────────────

describe('generateFunLabels', () => {
  beforeEach(() => {
    const profileRow = {
      shareable_profile: { intro: '测试', interests: ['画画'], chat_style: '温和', looking_for: '好友' },
      fun_labels: null,
    }

    const mockDb: any = {
      from: (_table: string) => ({
        select: (_cols: string) => ({
          eq: (_c: string, _v: unknown) => ({
            maybeSingle: () => Promise.resolve({ data: profileRow, error: null }),
          }),
        }),
        upsert: (_data: unknown) => ({
          eq: (_c: string, _v: unknown) => Promise.resolve({ error: null }),
        }),
      }),
    }

    vi.spyOn(supabaseLib, 'getServiceClient').mockReturnValue(mockDb as any)
    vi.spyOn(llmLib, 'llmJson').mockResolvedValue({
      mbti_guess: 'INFP',
      reason: '内敛且有创意',
      report: '（仅供娱乐）你可能是 INFP，喜欢独处…',
    })
    setLogWriter(async () => { })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    supabaseLib.resetServiceClientForTest()
    setLogWriter(null)
  })

  it('回傳 LLM 生成的 fun labels', async () => {
    const { generateFunLabels } = await import('../../server/friend/funLabels')
    const result = await generateFunLabels('u1')
    expect(result.mbti_guess).toBe('INFP')
    expect(result.report).toContain('（仅供娱乐）')
    expect(result.user_mbti).toBeNull()
  })

  it('沒有 shareable_profile 時拋 FunLabelsError', async () => {
    const emptyDb: any = {
      from: (_table: string) => ({
        select: (_cols: string) => ({
          eq: (_c: string, _v: unknown) => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
    }
    vi.spyOn(supabaseLib, 'getServiceClient').mockReturnValue(emptyDb)

    const { generateFunLabels, FunLabelsError } = await import('../../server/friend/funLabels')
    await expect(generateFunLabels('u1')).rejects.toThrow(FunLabelsError)
  })
})
