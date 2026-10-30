// C4 聊天室前端純函數：合併訊息、氣泡樣式、能不能輸入、判定文字沒有數字。
import { describe, expect, it } from 'vitest'
import {
  CHAT_TEXT,
  canType,
  expectsTwinReply,
  mergeMessages,
  placeholderOf,
  sideLabel,
  speakerOf,
  verdictText,
  withStatus,
} from '../../src/features/twin/components/chatRoomView'
import type { ChatMessageView, ChatRoomView } from '../../src/lib/api/twin'

const ME = 'user-me'
const AN = 'user-an'

function msg(id: string, sender: string, isAi: boolean, second: number): ChatMessageView {
  return {
    id,
    conversation_id: 'conv-1',
    sender_id: sender,
    is_ai: isAi,
    guard_rewritten: false,
    content: id,
    created_at: new Date(Date.UTC(2026, 9, 30, 10, 0, second)).toISOString(),
  }
}

function room(overrides: Partial<ChatRoomView> = {}): ChatRoomView {
  return {
    conversationId: 'conv-1',
    status: 'active',
    me: { userId: ME, controller: 'twin' },
    other: { userId: AN, name: '小安', controller: 'twin' },
    messages: [],
    ...overrides,
  }
}

describe('mergeMessages', () => {
  it('同一個 id 只留一則，依時間排序，不改原陣列', () => {
    const current = [msg('m1', ME, true, 1), msg('m3', ME, true, 3)]
    const merged = mergeMessages(current, [msg('m2', AN, true, 2), msg('m3', ME, true, 3)])
    expect(merged.map((m) => m.id)).toEqual(['m1', 'm2', 'm3'])
    expect(current.map((m) => m.id)).toEqual(['m1', 'm3'])
  })
})

describe('speakerOf', () => {
  it('我方分身／我方本人在右，對方在左', () => {
    expect(speakerOf(msg('a', ME, true, 1), ME)).toBe('twin')
    expect(speakerOf(msg('b', ME, false, 1), ME)).toBe('human')
    expect(speakerOf(msg('c', AN, true, 1), ME)).toBe('other-twin')
    expect(speakerOf(msg('d', AN, false, 1), ME)).toBe('other-twin')
  })
})

describe('輸入框', () => {
  it('我方是分身時不能輸入，是本人才可以；對話結束就不行', () => {
    expect(canType(room())).toBe(false)
    expect(canType(room({ me: { userId: ME, controller: 'human' } }))).toBe(true)
    expect(canType(room({ me: { userId: ME, controller: 'human' }, status: 'ended' }))).toBe(false)
    expect(placeholderOf(room())).toBe(CHAT_TEXT.placeholderTwin)
  })

  it('對方是分身且進行中才會等它回覆', () => {
    expect(expectsTwinReply(room())).toBe(true)
    expect(expectsTwinReply(room({ status: 'waiting_human' }))).toBe(false)
    expect(expectsTwinReply(room({ other: { userId: AN, name: '小安', controller: 'human' } }))).toBe(false)
  })
})

describe('withStatus', () => {
  it('用最新狀態更新誰在聊，不改原物件', () => {
    const before = room()
    const after = withStatus(before, { status: 'active', myController: 'human', otherController: 'twin', verdict: null })
    expect(after.me.controller).toBe('human')
    expect(before.me.controller).toBe('twin')
    expect(withStatus(before, null)).toBe(before)
  })
})

describe('顯示文字', () => {
  it('雙方標示本人／分身', () => {
    expect(sideLabel('mine', 'twin')).toBe(CHAT_TEXT.mineTwin)
    expect(sideLabel('other', 'human')).toBe(CHAT_TEXT.otherHuman)
  })

  it('判定只顯示文字與走勢，沒有數字', () => {
    expect(verdictText(null)).toBeNull()
    expect(verdictText({ value: 'suitable', trend: 'up' })).toBe('合适 · 走势上升')
    expect(verdictText({ value: 'uncertain', trend: 'flat' })).toBe('还在观察 · 走势持平')
    expect(verdictText({ value: 'unsuitable', trend: 'down' })).toBe('不太合适 · 走势下降')
    for (const value of ['suitable', 'uncertain', 'unsuitable'] as const) {
      expect(verdictText({ value, trend: 'flat' })).not.toMatch(/\d/)
    }
  })
})
