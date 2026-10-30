/**
 * A1 必测：pickNextEvent 解锁规则与不重复；getLifeUpdate 超出范围行为。
 * 規格：docs/07A「A1」。
 */
import { describe, expect, it } from 'vitest'
import { EVENTS, LIFE_UPDATES, getLifeUpdate, pickNextEvent } from '../../server/friend/persona'

describe('pickNextEvent 解锁与不重复', () => {
  it('stage 0 只给轻事件，顺序由轻到重', () => {
    const e1 = pickNextEvent(0, [])
    expect(e1?.id).toBe('e1_exhibition')
    const e2 = pickNextEvent(0, ['e1_exhibition'])
    expect(e2?.id).toBe('e2_fanart')
    const none = pickNextEvent(0, ['e1_exhibition', 'e2_fanart'])
    expect(none).toBeNull()
  })

  it('stage 1 解锁中等强度事件', () => {
    const e = pickNextEvent(1, ['e1_exhibition', 'e2_fanart'])
    expect(e?.id).toBe('e3_roommate')
  })

  it('stage 2 全部解锁，且照 EVENTS 顺序跳过已分享', () => {
    const e = pickNextEvent(2, ['e1_exhibition', 'e2_fanart', 'e3_roommate', 'e4_loan', 'e5_credit'])
    expect(e?.id).toBe('e6_quit')
    expect(pickNextEvent(2, EVENTS.map((e) => e.id))).toBeNull()
  })

  it('事件库强度由轻到重排列', () => {
    const sev = EVENTS.map((e) => e.severity)
    const firstMid = sev.indexOf('中')
    expect(sev.slice(0, firstMid)).toEqual(Array(firstMid).fill('轻'))
    expect(sev.slice(firstMid)).toEqual(Array(sev.length - firstMid).fill('中'))
  })

  it('所有事件 id 唯一', () => {
    expect(new Set(EVENTS.map((e) => e.id)).size).toBe(EVENTS.length)
  })
})

describe('getLifeUpdate 边界', () => {
  it('stage 0 是第一档（首次见面用 intro）', () => {
    expect(getLifeUpdate(0)).toBe(LIFE_UPDATES[0])
  })

  it('超过最大阶段停在最后一个', () => {
    const last = LIFE_UPDATES[LIFE_UPDATES.length - 1]!
    expect(getLifeUpdate(99)).toBe(last)
    expect(getLifeUpdate(LIFE_UPDATES.length)).toBe(last)
  })

  it('负数当 0', () => {
    expect(getLifeUpdate(-1)).toBe(LIFE_UPDATES[0])
  })
})
