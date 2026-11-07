import { describe, expect, it } from 'vitest'
import { buildFunnel, firstTaskText, normalizeQuickProfile, onboardingView, OnboardingError, type OnboardingState } from '../../server/social/onboarding'
import { BlockedContentError } from '../../server/lib/moderation'
import { CONFIG } from '../../server/lib/config'

const profile = { intro: '爱爬山的设计师', interests: ['登山', '摄影'], chat_style: '轻松', looking_for: '周末一起爬山' }
const fresh: OnboardingState = { userMessages: 0, shareable: null, confirmed: false, socialAgentEnabled: false, startedTaskIds: [], firstResultConversationId: null }

describe('新手引導進度', () => {
  it('新用戶停在第一步', () => {
    const v = onboardingView(fresh)
    expect(v.current).toBe('chat')
    expect(v.doneCount).toBe(0)
    expect(v.steps.map((s) => s.key)).toEqual(['chat', 'profile', 'lobby', 'task', 'result'])
  })

  it(`說滿 ${CONFIG.ONBOARDING_CHAT_MESSAGES} 句 → 下一步是檔案`, () => {
    expect(onboardingView({ ...fresh, userMessages: CONFIG.ONBOARDING_CHAT_MESSAGES }).current).toBe('profile')
  })

  it('用快速建檔跳過聊天：聊天也算完成，下一步進大廳', () => {
    const v = onboardingView({ ...fresh, shareable: profile })
    expect(v.steps.slice(0, 2).every((s) => s.done)).toBe(true)
    expect(v.current).toBe('lobby')
  })

  it('檔案只有 1 個興趣還不算完成', () => {
    expect(onboardingView({ ...fresh, userMessages: 5, shareable: { ...profile, interests: ['登山'] } }).current).toBe('profile')
  })

  it('中途離開再回來：停在還沒做的那一步（從紀錄算，不靠瀏覽器）', () => {
    const inLobby = { ...fresh, userMessages: 4, shareable: profile, confirmed: true, socialAgentEnabled: true }
    expect(onboardingView(inLobby).current).toBe('task')
    expect(onboardingView({ ...inLobby, startedTaskIds: ['t1'] })).toMatchObject({ current: 'result', latestTaskId: 't1' })
    expect(onboardingView({ ...inLobby, startedTaskIds: ['t1'], firstResultConversationId: 'c1' })).toMatchObject({ current: null, doneCount: 5, resultConversationId: 'c1' })
  })
})

describe('快速建檔', () => {
  it('整理興趣（去重、去空白、最多 8 個）並補聊天風格', () => {
    expect(normalizeQuickProfile({ intro: ' 你好 ', interests: ['登山', ' 登山', '', '摄影'], looking_for: '朋友' })).toEqual({
      intro: '你好',
      interests: ['登山', '摄影'],
      chat_style: '轻松自然，喜欢真诚交流',
      looking_for: '朋友',
    })
  })

  it('缺介紹、興趣不到 2 個、沒說想找誰：給清楚的提示', () => {
    expect(() => normalizeQuickProfile({ intro: '', interests: ['a', 'b'], looking_for: 'x' })).toThrow(OnboardingError)
    expect(() => normalizeQuickProfile({ intro: 'x', interests: ['a'], looking_for: 'x' })).toThrow('至少写 2 个兴趣')
    expect(() => normalizeQuickProfile({ intro: 'x', interests: ['a', 'b'], looking_for: ' ' })).toThrow(OnboardingError)
  })

  it('有敏感詞不保存', () => {
    expect(() => normalizeQuickProfile({ intro: '想约炮', interests: ['a', 'b'], looking_for: 'x' })).toThrow(BlockedContentError)
  })
})

describe('第一個任務與漏斗', () => {
  it('第一個任務用第一個興趣找 1 位', () => {
    expect(firstTaskText(profile)).toBe('帮我找 1 位也喜欢登山的朋友聊聊')
    expect(firstTaskText(null)).toBe('帮我找 1 位聊得来的朋友聊聊')
  })

  it('漏斗：每一步走到的人數和比例', () => {
    const inLobby = { ...fresh, userMessages: 4, shareable: profile, confirmed: true, socialAgentEnabled: true }
    const funnel = buildFunnel([fresh, { ...fresh, userMessages: 3 }, inLobby, { ...inLobby, startedTaskIds: ['t'] }])
    expect(funnel.map((r) => [r.step, r.users, r.percent])).toEqual([
      ['signup', 4, 100],
      ['chat', 3, 75],
      ['profile', 2, 50],
      ['lobby', 2, 50],
      ['task', 1, 25],
      ['result', 0, 0],
    ])
    expect(buildFunnel([])[0]).toMatchObject({ users: 0, percent: 0 })
  })
})

it('filters negation and strips positive prefixes before saving quick interests', () => {
  expect(normalizeQuickProfile({ intro: '你好', interests: ['不喜欢昆虫', '登山', '喜欢摄影'], looking_for: '朋友' }).interests)
    .toEqual(['登山', '摄影'])
  expect(() => normalizeQuickProfile({ intro: '你好', interests: ['不喜欢昆虫', '登山'], looking_for: '朋友' }))
    .toThrow('「不喜欢……」不算兴趣，至少写 2 个你喜欢的事')
})
