import { describe, expect, it } from 'vitest'
import { pickFriendReply, type FriendReplyInput } from '../../src/demo/friendChat'
import { friendFallbacks, friendGreetings, friendSelfShares } from '../../src/demo/scenario'

const base: FriendReplyInput = { text: '', usedIds: [], userCount: 1, recentTexts: [] }

describe('pickFriendReply：阿澈的 demo 回复（UX #5）', () => {
  it('打招呼 → 招呼回复，不会答非所问讲同人图', () => {
    for (const text of ['你好呀', '嗨', 'hi', 'Hi 阿澈']) {
      const r = pickFriendReply({ ...base, text })
      expect(friendGreetings).toContain(r.text)
      expect(r.text).not.toContain('同人图')
    }
  })

  it('「你在吗？」算打招呼，不算问问题', () => {
    expect(friendGreetings).toContain(pickFriendReply({ ...base, text: '你在吗？' }).text)
  })

  it('问阿澈问题 → 分享自己近况', () => {
    for (const text of ['你最近怎样', '你喜欢什么', '你也画画吗', '你周末去哪？']) {
      expect(friendSelfShares).toContain(pickFriendReply({ ...base, text }).text)
    }
  })

  it('关键词命中会带记忆，用过一次就不再重复', () => {
    const first = pickFriendReply({ ...base, text: '我周末想去漫展' })
    expect(first.memory?.content).toContain('漫展')
    expect(first.once).toBe(true)
    const again = pickFriendReply({ ...base, text: '漫展真好玩', usedIds: [first.id] })
    expect(again.id).not.toBe(first.id)
  })

  it('普通陈述用通用回复，不会出现「我懂那种感觉」这种答非所问', () => {
    const r = pickFriendReply({ ...base, text: '我是程序员' })
    expect(r.text).not.toContain('懂那种感觉')
    expect(r.text.length).toBeGreaterThan(0)
  })

  it('剧本用完后一定回话，且不会连续两次一样', () => {
    const used: string[] = []
    const recent: string[] = []
    let last = ''
    for (let i = 0; i < 30; i++) {
      const r = pickFriendReply({ text: '嗯', usedIds: used, userCount: i + 1, recentTexts: recent.slice(-2) })
      expect(r.text.length).toBeGreaterThan(0)
      expect(r.text).not.toBe(last)
      if (r.once) used.push(r.id)
      recent.push(r.text)
      last = r.text
    }
  })

  it('通用回复池有 8～10 则', () => {
    expect(friendFallbacks.length).toBeGreaterThanOrEqual(8)
    expect(friendFallbacks.length).toBeLessThanOrEqual(10)
  })
})
