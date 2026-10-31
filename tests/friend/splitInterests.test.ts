import { describe, expect, it } from 'vitest'
import { splitInterests } from '../../src/features/friend/splitInterests'

describe('splitInterests：兴趣输入拆分（UX #3）', () => {
  it('逗号、顿号、空格混用都能拆开，英文单字不会被切烂', () => {
    expect(splitInterests('看展, music, sports、登山 摄影')).toEqual(['看展', 'music', 'sports', '登山', '摄影'])
  })

  it('全角逗号、连续分隔符、头尾空白都忽略', () => {
    expect(splitInterests('  动漫，，漫展、 、 ')).toEqual(['动漫', '漫展'])
  })

  it('空字符串 → 空列表', () => {
    expect(splitInterests('')).toEqual([])
  })
})
