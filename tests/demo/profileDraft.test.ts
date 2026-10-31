import { describe, expect, it } from 'vitest'
import { draftProfile, STYLE_OBSERVING } from '../../src/demo/profileDraft'

describe('draftProfile：demo 档案草稿只从记忆整理（UX #33）', () => {
  it('没有记忆 → 不预填二次元、INFP 等假资料', () => {
    const p = draftProfile([])
    expect(p.interests).toEqual([])
    expect(p.mbti).toBeUndefined()
    expect(p.chatStyle).toBe(STYLE_OBSERVING)
    expect(p.confirmed).toBe(false)
  })

  it('有漫展、登山的记忆 → 兴趣跟着记忆', () => {
    const p = draftProfile([{ content: '用户计划周末去漫展' }, { content: '用户开始接触登山' }])
    expect(p.interests).toEqual(['动漫', '漫展', '登山（新手）'])
    expect(p.intro).toContain('动漫')
  })
})
