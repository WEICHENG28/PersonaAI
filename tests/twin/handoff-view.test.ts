// C6 本人接手前端純函數：什麼時候能接手（接手後按鈕消失、不能交回）、從結果頁帶進聊天室的接手卡片要驗證格式。
import { describe, expect, it } from 'vitest'
import { HANDOFF_TEXT, readHandoffState, takeoverBlockOf } from '../../src/features/twin/components/handoffView'
import type { TakeoverView } from '../../src/lib/api/twin'

const VIEW: TakeoverView = {
  conversationId: 'conv-1',
  verdict: { value: 'suitable', trend: 'up' },
  summary: { key_points: ['聊了登山'], other_highlights: [], twin_said: ['分身已经替你说过：喜欢慢慢走'], open_topics: [], suggested_replies: [] },
  summaryFailed: false,
}

describe('takeoverBlockOf', () => {
  it('我方是分身、對話沒結束才能接手', () => {
    expect(takeoverBlockOf({ status: 'active', me: { controller: 'twin' } })).toBeNull()
    expect(takeoverBlockOf({ status: 'waiting_human', me: { controller: 'twin' } })).toBeNull()
  })

  it('已經本人接手 → 不能再接手（沒有交回分身）；對話結束 → 不能接手', () => {
    expect(takeoverBlockOf({ status: 'active', me: { controller: 'human' } })).toBe(HANDOFF_TEXT.alreadyHuman)
    expect(takeoverBlockOf({ status: 'ended', me: { controller: 'twin' } })).toBe(HANDOFF_TEXT.ended)
  })
})

describe('readHandoffState', () => {
  it('同一段對話的接手卡片 → 原樣回傳', () => {
    expect(readHandoffState({ handoff: VIEW }, 'conv-1')).toBe(VIEW)
  })

  it('別段對話、沒有 state、格式不對 → null', () => {
    expect(readHandoffState({ handoff: VIEW }, 'conv-2')).toBeNull()
    expect(readHandoffState(null, 'conv-1')).toBeNull()
    expect(readHandoffState({ other: 1 }, 'conv-1')).toBeNull()
    expect(readHandoffState({ handoff: { ...VIEW, summary: { key_points: 'x' } } }, 'conv-1')).toBeNull()
  })
})
