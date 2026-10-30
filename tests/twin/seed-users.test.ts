// C0：種子用戶資料符合 docs/07 第 5 節型別與 07C C0 表格。
import { describe, expect, it } from 'vitest'
import { SEED_USERS } from '../../server/fixtures/seed-users'

const INTRO_MAX = 20
const TRAITS = ['O', 'C', 'E', 'A', 'N'] as const
const EXPECTED_NAMES = ['小安', '阿哲', '子晴', '品妤', '志明', '小林', '夏夏', '阿凯', '雨晴', '宇翔']

const byName = (name: string) => {
  const user = SEED_USERS.find((u) => u.display_name === name)
  if (!user) throw new Error(`找不到種子用戶 ${name}`)
  return user
}

describe('種子用戶資料', () => {
  it('剛好 10 位，名字照 07C 表格，key 不重複', () => {
    expect(SEED_USERS.map((u) => u.display_name)).toEqual(EXPECTED_NAMES)
    expect(new Set(SEED_USERS.map((u) => u.key)).size).toBe(SEED_USERS.length)
  })

  it.each(SEED_USERS.map((u) => [u.display_name, u] as const))('%s 的對外檔案完整、一句話介紹 20 字內', (_name, u) => {
    expect([...u.shareable.intro].length).toBeLessThanOrEqual(INTRO_MAX)
    expect(u.shareable.interests.length).toBeGreaterThan(0)
    expect(u.shareable.chat_style).not.toBe('')
    expect(u.shareable.looking_for).not.toBe('')
    expect(u.purposes.length).toBeGreaterThan(0)
  })

  it.each(SEED_USERS.map((u) => [u.display_name, u] as const))('%s 的 Big Five 是 0–100 分、confidence 0.8、有 evidence', (_name, u) => {
    for (const t of TRAITS) {
      const s = u.agent_profile.big_five[t]
      expect(s.score).toBeGreaterThanOrEqual(0)
      expect(s.score).toBeLessThanOrEqual(100)
      expect(s.confidence).toBe(0.8)
      expect(s.evidence).not.toBe('')
    }
    expect(u.agent_profile.values.length).toBeGreaterThan(0)
  })

  it('Demo 前 3 位都喜歡登山，且風格設定符合 07C', () => {
    for (const name of ['小安', '阿哲', '子晴']) expect(byName(name).shareable.interests).toContain('登山')

    const an = byName('小安')
    expect(an.agent_profile.style.sentence_length).toBe('short')
    expect(an.agent_profile.style.emoji_level).toBeLessThanOrEqual(1)
    expect(an.preferences).toEqual({ personality: 'similar', conditions: [] })

    const zhe = byName('阿哲')
    expect(zhe.agent_profile.style.sentence_length).toBe('long')
    expect(zhe.agent_profile.style.emoji_level).toBe(3)

    expect(byName('子晴').preferences.conditions).toContain('个性外向、主动找话题')
  })

  it('互補型只有阿凯、宇翔', () => {
    const complementary = SEED_USERS.filter((u) => u.preferences.personality === 'complementary')
    expect(complementary.map((u) => u.display_name)).toEqual(['阿凯', '宇翔'])
  })
})
