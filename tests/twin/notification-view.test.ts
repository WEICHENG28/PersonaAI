// C7 通知鈴鐺前端純函數：各類型的文字、點了去哪、未讀數、等我回應的請求、不改原陣列。
import { describe, expect, it } from 'vitest'
import {
  isPendingAnomaly,
  isPendingRequest,
  notificationLink,
  notificationTitle,
  NOTIFY_TEXT,
  PANEL_EDGE,
  panelPlacement,
  timeLabel,
  unreadCount,
  withChoice,
  withRead,
  withResponse,
} from '../../src/features/twin/components/notificationView'
import type { NotificationView } from '../../src/lib/api/twin'

function n(overrides: Partial<NotificationView> = {}): NotificationView {
  return {
    id: 'n-1',
    type: 'request_human',
    createdAt: '2026-10-31T10:05:00.000Z',
    read: false,
    response: null,
    conversationId: 'conv-1',
    name: '小明',
    mutual: false,
    evidence: [],
    choice: null,
    ...overrides,
  }
}

describe('notificationTitle', () => {
  it('依類型顯示 07C C7 的文字', () => {
    expect(notificationTitle(n({ type: 'match', name: '小安' }))).toBe('找到合适的人：小安')
    expect(notificationTitle(n())).toBe('小明 想和本人聊')
    expect(notificationTitle(n({ type: 'anomaly' }))).toBe('提醒：对方的言行和他的描述差很多')
    expect(notificationTitle(n({ type: 'friend_report' }))).toBe('阿澈有事想跟你说')
  })

  it('沒有名字時用「有人」', () => {
    expect(notificationTitle(n({ name: null }))).toBe('有人 想和本人聊')
    expect(notificationTitle(n({ type: 'match', name: '  ' }))).toBe('找到合适的人：有人')
  })

  it('沒有 emoji、沒有數字分數', () => {
    const all = (['match', 'request_human', 'anomaly', 'friend_report'] as const).map((type) => notificationTitle(n({ type, mutual: true })))
    for (const text of all) {
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u)
      expect(text).not.toMatch(/\d/)
    }
  })
})

describe('notificationLink', () => {
  it('match → 結果頁；friend_report → /friend', () => {
    expect(notificationLink(n({ type: 'match' }))).toBe('/chat/conv-1/result')
    expect(notificationLink(n({ type: 'friend_report', conversationId: null }))).toBe('/friend')
  })

  it('請求真人：選了現在聊才連到聊天室；還沒回應、稍後聊、拒絕都不跳轉', () => {
    expect(notificationLink(n({ response: 'now', read: true }))).toBe('/chat/conv-1')
    expect(notificationLink(n())).toBeNull()
    expect(notificationLink(n({ response: 'later' }))).toBeNull()
    expect(notificationLink(n({ response: 'decline' }))).toBeNull()
  })

  it('anomaly → 回到聊天室；沒有對話 id 的 match、anomaly 不跳轉', () => {
    expect(notificationLink(n({ type: 'anomaly' }))).toBe('/chat/conv-1')
    expect(notificationLink(n({ type: 'match', conversationId: null }))).toBeNull()
    expect(notificationLink(n({ type: 'anomaly', conversationId: null }))).toBeNull()
  })
})

describe('未讀與等待回應', () => {
  it('unreadCount 只算沒讀的', () => {
    expect(unreadCount([n(), n({ id: 'n-2', read: true }), n({ id: 'n-3', type: 'friend_report' })])).toBe(2)
  })

  it('isPendingRequest：請求真人、還沒回應', () => {
    expect(isPendingRequest(n())).toBe(true)
    expect(isPendingRequest(n({ response: 'later', read: true }))).toBe(false)
    expect(isPendingRequest(n({ read: true }))).toBe(false)
    expect(isPendingRequest(n({ type: 'match' }))).toBe(false)
  })

  it('withResponse／withRead 回新陣列，不改原本的', () => {
    const list = [n(), n({ id: 'n-2', type: 'match' })]
    const responded = withResponse(list, 'n-1', 'decline')
    expect(responded[0]).toMatchObject({ response: 'decline', read: true })
    expect(list[0]).toMatchObject({ response: null, read: false })
    const read = withRead(list, 'n-2')
    expect(read[1]!.read).toBe(true)
    expect(list[1]!.read).toBe(false)
  })

  it('isPendingAnomaly：言行異常提醒、還沒選；withChoice 回新陣列', () => {
    const a = n({ type: 'anomaly', evidence: ['多次辱骂'] })
    expect(isPendingAnomaly(a)).toBe(true)
    expect(isPendingAnomaly(n({ type: 'anomaly', choice: 'continue', read: true }))).toBe(false)
    expect(isPendingAnomaly(n())).toBe(false)
    const list = [a]
    expect(withChoice(list, 'n-1', 'end')[0]).toMatchObject({ choice: 'end', read: true })
    expect(list[0]).toMatchObject({ choice: null, read: false })
    expect(NOTIFY_TEXT.chosen.report).toBe('已记录检举')
  })

  it('回應後的文字', () => {
    expect(NOTIFY_TEXT.responded.later).toBe('已告诉对方你晚点上线')
  })
})

describe('timeLabel', () => {
  it('今天只顯示時間，其他天顯示日期；壞掉的時間回空字串', () => {
    const now = new Date(2026, 9, 31, 12, 0)
    expect(timeLabel(new Date(2026, 9, 31, 9, 5).toISOString(), now)).toBe('09:05')
    expect(timeLabel(new Date(2026, 9, 30, 9, 5).toISOString(), now)).toBe('10月30日')
    expect(timeLabel('not a date', now)).toBe('')
  })
})

describe('panelPlacement', () => {
  it('桌機：面板在鈴鐺下方、右緣對齊鈴鐺', () => {
    expect(panelPlacement({ bottom: 60, right: 900 }, 1280)).toEqual({ top: 72, right: 380, width: 380 })
  })

  it('手機：鈴鐺不在最右邊時往右推，左右都留邊、不超出畫面', () => {
    const p = panelPlacement({ bottom: 56, right: 150 }, 375)
    expect(p.width).toBe(375 - PANEL_EDGE * 2)
    expect(p.right).toBe(PANEL_EDGE)
    expect(375 - p.right - p.width).toBeGreaterThanOrEqual(PANEL_EDGE)
  })

  it('鈴鐺貼著右邊：至少留 PANEL_EDGE', () => {
    expect(panelPlacement({ bottom: 40, right: 1280 }, 1280).right).toBe(PANEL_EDGE)
  })

  it('加高頂欄：按鈕置中使錨點 bottom + GAP 落在頂欄內時，面板 top 至少在頂欄下緣 + GAP', () => {
    // 按鈕 bottom 78px，但頂欄下緣 88px → 面板不可蓋住頂欄
    expect(panelPlacement({ bottom: 78, right: 900 }, 1280, 88).top).toBe(88 + 12)
    // 錨點本來就在頂欄外時 minTop 不影響結果
    expect(panelPlacement({ bottom: 96, right: 900 }, 1280, 88).top).toBe(96 + 12)
  })
})
