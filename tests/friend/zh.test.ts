/**
 * 繁→簡轉換（server/lib/zh.ts）測試。
 * 種子用戶興趣都是簡體；用戶手打繁體（「攝影」）要比對得到「摄影」。
 */
import { describe, it, expect } from 'vitest'
import { toSimplified, shareableToSimplified } from '../../server/lib/zh'

describe('toSimplified', () => {
  it('常見繁體興趣字轉成簡體', () => {
    expect(toSimplified('攝影')).toBe('摄影')
    expect(toSimplified('登山')).toBe('登山') // 本來就是簡體，不變
    expect(toSimplified('看漫畫')).toBe('看漫画')
    expect(toSimplified('聽音樂')).toBe('听音乐')
    expect(toSimplified('桌遊')).toBe('桌游')
  })

  it('沒涵蓋的字元原樣保留（寧可少轉，不要轉錯）', () => {
    expect(toSimplified('咖啡')).toBe('咖啡')
    expect(toSimplified('hello')).toBe('hello')
    expect(toSimplified('123')).toBe('123')
  })
})

describe('shareableToSimplified', () => {
  it('四個文字欄位全轉簡體', () => {
    const out = shareableToSimplified({
      intro: '喜歡攝影與登山',
      interests: ['攝影', '看漫畫'],
      chat_style: '溫和慢熱', // 「溫」「熱」也在表內
      looking_for: '找運動夥伴',
    })
    expect(out.intro).toBe('喜欢摄影与登山')
    expect(out.interests).toEqual(['摄影', '看漫画'])
    expect(out.chat_style).toBe('温和慢热')
    expect(out.looking_for).toBe('找运动伙伴')
  })

  it('不改動原物件（回傳新物件）', () => {
    const input = { intro: '攝影', interests: ['攝影'], chat_style: '溫和', looking_for: '運動' }
    shareableToSimplified(input)
    expect(input.interests).toEqual(['攝影'])
  })
})
