import { describe, expect, it } from 'vitest'
import { answerLobbyQuestion, NO_MATCH_ANSWER } from '../../src/demo/lobbyHelper'
import { candidates } from '../../src/demo/fixtures'

describe('answerLobbyQuestion：demo 大厅助手（UX #26）', () => {
  it('找不到符合的人就老实说，并建议交给社交 Agent', () => {
    expect(answerLobbyQuestion('我想找会弹吉他的', candidates, [])).toBe(NO_MATCH_ANSWER)
  })

  it('依兴趣比对：问登山会列出喜欢登山的人', () => {
    const a = answerLobbyQuestion('有没有喜欢登山的？', candidates, [])
    expect(a).toContain('林小山')
    expect(a).toContain('陈岭')
    expect(a).not.toContain('周予安')
  })

  it('依聊天风格比对：安静 → 慢热的人', () => {
    const a = answerLobbyQuestion('想找个性比较安静的人', candidates, [])
    expect(a).toContain('林小山')
    expect(a).not.toContain('陈岭')
  })

  it('之前判定不合适的人不推荐', () => {
    const a = answerLobbyQuestion('有没有喜欢登山的？', candidates, ['陈岭'])
    expect(a).toContain('林小山')
    expect(a).not.toContain('陈岭')
  })

  it('问谁最合 → 推荐预估最高、且没被排除的人', () => {
    expect(answerLobbyQuestion('谁跟我最合适？', candidates, [])).toContain('林小山')
    expect(answerLobbyQuestion('谁跟我最合适？', candidates, ['林小山'])).toContain('周予安')
  })
})
