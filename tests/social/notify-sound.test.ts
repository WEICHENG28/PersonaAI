// 通知音效：只有未讀數變多才響，剛載入不響。
import { describe, expect, it } from 'vitest'
import { shouldChime } from '../../src/lib/notifySound'

describe('shouldChime', () => {
  it('剛載入（prev = null）不響；變多才響；變少或一樣不響', () => {
    expect(shouldChime(null, 3)).toBe(false)
    expect(shouldChime(1, 2)).toBe(true)
    expect(shouldChime(2, 1)).toBe(false)
    expect(shouldChime(2, 2)).toBe(false)
  })
})
