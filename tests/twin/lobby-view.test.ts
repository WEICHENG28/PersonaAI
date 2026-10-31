// C9 大廳畫面的純函數：AI 預估一律顯示文字，不顯示數字。
import { describe, expect, it } from 'vitest'
import { LOBBY_TEXT, fitFromPercent, fitText, hasFit } from '../../src/features/twin/components/lobbyView'

describe('大廳 AI 預估文字', () => {
  it('三級文字', () => {
    expect(fitText('likely')).toBe('很可能合得来')
    expect(fitText('maybe')).toBe('可以聊聊看')
    expect(fitText('different')).toBe('差异较大')
  })

  it('沒有預估（檔案還沒確認）時畫面整行不顯示，不是改顯示提示文字', () => {
    expect(hasFit(null)).toBe(false)
    expect(hasFit('likely')).toBe(true)
    expect(hasFit('maybe')).toBe(true)
    expect(hasFit('different')).toBe(true)
  })

  it('mock 的 0–100 數字換成同樣的三級，畫面不出現數字', () => {
    expect(fitFromPercent(82)).toBe('likely')
    expect(fitFromPercent(74)).toBe('maybe')
    expect(fitFromPercent(60)).toBe('different')
    for (const p of [95, 70, 10]) expect(fitText(fitFromPercent(p))).not.toMatch(/\d/)
  })
})
