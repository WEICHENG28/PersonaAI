import { describe, expect, it } from 'vitest'
import { parseTaskDraft, suitableTarget } from '../../src/demo/taskDraft'

describe('parseTaskDraft：一句话交办解析（UX #4）', () => {
  it('预设句子：3 个喜欢登山的人 → 运动伙伴、2 位就停', () => {
    const d = parseTaskDraft('帮我找 3 个喜欢登山的人聊聊')
    expect(d.count).toBe(3)
    expect(d.condition).toBe('喜欢登山')
    expect(d.goal).toBe('运动伙伴')
    expect(d.doneWhen).toBe('找到 2 位双向合适就停')
    expect(d.isDemoScript).toBe(true)
  })

  it('阿拉伯数字 2 → 2 人，完成条件 ⌈2×2/3⌉ = 2', () => {
    const d = parseTaskDraft('帮我找 2 个喜欢登山的人')
    expect(d.count).toBe(2)
    expect(d.doneWhen).toBe('找到 2 位双向合适就停')
  })

  it('中文数字一～十都认得（含「两」）', () => {
    expect(parseTaskDraft('找五个喜欢跑步的人').count).toBe(5)
    expect(parseTaskDraft('找两位喜欢读书的朋友').count).toBe(2)
    expect(parseTaskDraft('找十个人聊聊').count).toBe(10)
    expect(parseTaskDraft('找一个人').count).toBe(1)
  })

  it('电影 → 兴趣搭子，不是登山就标示不是示范剧本', () => {
    const d = parseTaskDraft('帮我找 2 个喜欢看电影的女生')
    expect(d.count).toBe(2)
    expect(d.condition).toBe('喜欢看电影')
    expect(d.goal).toBe('兴趣搭子')
    expect(d.isDemoScript).toBe(false)
  })

  it('目的对照：读书 → 读书搭子、看展 → 兴趣搭子、跑步 → 运动伙伴、其他 → 聊天朋友', () => {
    expect(parseTaskDraft('找 3 个喜欢读书的人').goal).toBe('读书搭子')
    expect(parseTaskDraft('找 3 个喜欢看展的人').goal).toBe('兴趣搭子')
    expect(parseTaskDraft('找 4 个喜欢跑步的人').goal).toBe('运动伙伴')
    expect(parseTaskDraft('找 3 个喜欢猫的人').goal).toBe('聊天朋友')
  })

  it('没写人数 → 预设 3；没写条件 → 不限；超过 10 夹到 10', () => {
    const d = parseTaskDraft('帮我找人聊聊')
    expect(d.count).toBe(3)
    expect(d.condition).toBe('不限')
    expect(parseTaskDraft('找 50 个人').count).toBe(10)
  })

  it('suitableTarget 是 ⌈人数×2/3⌉，至少 1', () => {
    expect(suitableTarget(1)).toBe(1)
    expect(suitableTarget(3)).toBe(2)
    expect(suitableTarget(4)).toBe(3)
    expect(suitableTarget(10)).toBe(7)
  })
})
