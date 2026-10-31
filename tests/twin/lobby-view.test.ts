// C9 大廳畫面的純函數：AI 預估一律顯示文字，不顯示數字。
import { describe, expect, it } from 'vitest'
import { LOBBY_TEXT, fitFromPercent, fitText } from '../../src/features/twin/components/lobbyView'

describe('大廳 AI 預估文字', () => {
  it('三級文字；沒有預估時提示先確認檔案', () => {
    expect(fitText('likely')).toBe('很可能合得来')
    expect(fitText('maybe')).toBe('可以聊聊看')
    expect(fitText('different')).toBe('差异较大')
    expect(fitText(null)).toBe(LOBBY_TEXT.fitUnknown)
  })

  it('mock 的 0–100 數字換成同樣的三級，畫面不出現數字', () => {
    expect(fitFromPercent(82)).toBe('likely')
    expect(fitFromPercent(74)).toBe('maybe')
    expect(fitFromPercent(60)).toBe('different')
    for (const p of [95, 70, 10]) expect(fitText(fitFromPercent(p))).not.toMatch(/\d/)
  })
})
