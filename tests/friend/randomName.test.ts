import { describe, expect, it } from 'vitest'
import { randomName } from '../../src/features/friend/randomName'

describe('randomName', () => {
  it('产生「特质＋名字」的用户名称', () => {
    expect(randomName(() => 0)).toBe('爱看展的小鹿')
    expect(randomName(() => 0.999)).toBe('安静的云雀')
  })
  it('每次都有值', () => {
    for (let i = 0; i < 50; i++) expect(randomName().length).toBeGreaterThan(2)
  })
})
