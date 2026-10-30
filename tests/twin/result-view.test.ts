// C5 結果頁前端純函數：依輪數分組（點「第 n 輪」捲到那一組）、判定文字沒有數字。
import { describe, expect, it } from 'vitest'
import { groupByRound, RESULT_TEXT, verdictLine } from '../../src/features/twin/components/resultView'
import type { ResultMessage } from '../../src/lib/api/twin'

function msg(id: string, round: number): ResultMessage {
  return { id, conversation_id: 'c', sender_id: 'u', is_ai: true, guard_rewritten: false, content: id, created_at: '2026-10-30T10:00:00Z', round }
}

describe('groupByRound', () => {
  it('同一輪的訊息放在同一組，順序不變', () => {
    const groups = groupByRound([msg('a', 1), msg('b', 1), msg('c', 2), msg('d', 2), msg('e', 3)])
    expect(groups.map((g) => [g.round, g.messages.map((m) => m.id)])).toEqual([
      [1, ['a', 'b']],
      [2, ['c', 'd']],
      [3, ['e']],
    ])
  })

  it('沒有訊息 → 空陣列', () => {
    expect(groupByRound([])).toEqual([])
  })
})

describe('verdictLine', () => {
  it('我方視角的文字判定＋走勢，沒有數字', () => {
    const line = verdictLine({ value: 'suitable', trend: 'up' })
    expect(line).toBe('对你来说：合适 · 走势上升')
    expect(line).not.toMatch(/\d/)
  })

  it('還沒有判定 → 提示文字', () => {
    expect(verdictLine(null)).toBe(RESULT_TEXT.verdictPending)
  })
})
