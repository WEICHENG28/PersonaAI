import { describe, expect, it } from 'vitest'
import { clampNumber } from '../../src/features/friend/NumberField'

describe('clampNumber：设置页数字栏位失焦验证（UX #20）', () => {
  it('范围内照用', () => {
    expect(clampNumber('30', 5, 120, 20)).toEqual({ value: 30, adjusted: false })
  })
  it('超出范围夹回并标示有调整', () => {
    expect(clampNumber('999', 5, 120, 20)).toEqual({ value: 120, adjusted: true })
    expect(clampNumber('0', 5, 120, 20)).toEqual({ value: 5, adjusted: true })
  })
  it('清空或不是数字 → 回到原本的值', () => {
    expect(clampNumber('', 5, 120, 25)).toEqual({ value: 25, adjusted: true })
    expect(clampNumber('abc', 1, 20, 10)).toEqual({ value: 10, adjusted: true })
  })
})
