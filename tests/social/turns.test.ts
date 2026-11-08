import { describe, expect, it } from 'vitest'
import { toAlternatingTurns } from '../../server/lib/llm/turns.js'

describe('toAlternatingTurns', () => {
  it('第一則一定是 user：開頭是 assistant 時補 leadIn', () => {
    expect(toAlternatingTurns([{ role: 'assistant', content: '嗨' }, { role: 'user', content: '你好' }])).toEqual([
      { role: 'user', content: '（打开聊天）' },
      { role: 'assistant', content: '嗨' },
      { role: 'user', content: '你好' },
    ])
    expect(toAlternatingTurns([{ role: 'assistant', content: '嗨' }], { leadIn: '（开始）' })[0]).toEqual({ role: 'user', content: '（开始）' })
  })

  it('連續同角色用換行合併，角色一定交替', () => {
    const out = toAlternatingTurns([
      { role: 'user', content: 'a' },
      { role: 'user', content: 'b' },
      { role: 'assistant', content: 'c' },
      { role: 'assistant', content: 'd' },
      { role: 'user', content: 'e' },
    ])
    expect(out).toEqual([
      { role: 'user', content: 'a\nb' },
      { role: 'assistant', content: 'c\nd' },
      { role: 'user', content: 'e' },
    ])
    for (let i = 1; i < out.length; i++) expect(out[i]!.role).not.toBe(out[i - 1]!.role)
  })

  it('空白訊息略過；不改動傳入的陣列', () => {
    const input = [{ role: 'user' as const, content: ' ' }, { role: 'user' as const, content: '你好' }]
    expect(toAlternatingTurns(input)).toEqual([{ role: 'user', content: '你好' }])
    expect(input[1]!.content).toBe('你好')
    expect(toAlternatingTurns([])).toEqual([])
  })
})
