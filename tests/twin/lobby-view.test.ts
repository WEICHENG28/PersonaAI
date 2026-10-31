// C9 大廳畫面的純函數：AI 預估只有文字，mock 的數字也只顯示等級。
import { describe, expect, it } from 'vitest'
import { FIT_TEXT, fitOfPercent } from '../../src/features/twin/components/lobbyView'

describe('大廳 AI 預估文字', () => {
  it('三級都是文字，沒有數字', () => {
    expect(Object.values(FIT_TEXT)).toEqual(['很可能合得来', '可以聊聊看', '差异较大'])
    expect(Object.values(FIT_TEXT).join('')).not.toMatch(/\d/)
  })

  it('mock 的 0～100 分數只換成等級（畫面不顯示數字）', () => {
    expect([82, 74, 69].map(fitOfPercent)).toEqual(['likely', 'maybe', 'different'])
  })
})
