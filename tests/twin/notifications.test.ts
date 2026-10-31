// C7 通知鈴鐺後端：每種通知只回鈴鐺要的欄位（friend_report 的報告內容不回）、只能把 match 設為已讀（資料庫用假的）。
import { describe, expect, it, vi } from 'vitest'
import { ChatRoomError } from '../../server/twin/chatRoom'
import {
  createNotificationApi,
  NOTIFICATION_LIST_LIMIT,
  toNotificationView,
  type NotificationStore,
} from '../../server/twin/notifications'
import type { NotificationRow } from '../../server/twin/requestHuman'

const ME = 'user-me'

function row(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: 'n-1',
    user_id: ME,
    type: 'match',
    payload: { conversationId: 'conv-1', targetName: '小安', mutual: true },
    response: null,
    read_at: null,
    created_at: '2026-10-31T10:00:00.000Z',
    ...overrides,
  }
}

describe('toNotificationView', () => {
  it('match：對方名字、對話、雙向合適', () => {
    expect(toNotificationView(row())).toEqual({
      id: 'n-1',
      type: 'match',
      createdAt: '2026-10-31T10:00:00.000Z',
      read: false,
      response: null,
      conversationId: 'conv-1',
      name: '小安',
      mutual: true,
    })
  })

  it('request_human：請求的人、對話、回應', () => {
    const view = toNotificationView(
      row({ type: 'request_human', payload: { conversationId: 'conv-2', fromName: '小明' }, response: 'later', read_at: '2026-10-31T10:01:00.000Z' }),
    )
    expect(view).toMatchObject({ type: 'request_human', conversationId: 'conv-2', name: '小明', response: 'later', read: true, mutual: false })
  })

  it('friend_report：不回報告內容', () => {
    const view = toNotificationView(row({ type: 'friend_report', payload: { task_id: 't', saved_minutes: 120, suitable: [{ display_name: '小安' }] } }))
    expect(view).toMatchObject({ type: 'friend_report', conversationId: null, name: null, mutual: false })
    expect(JSON.stringify(view)).not.toContain('120')
  })

  it('payload 欄位型別不對：當作沒有，不丟錯', () => {
    const view = toNotificationView(row({ payload: { conversationId: 42, targetName: ['x'], mutual: 'yes' } }))
    expect(view).toMatchObject({ conversationId: null, name: null, mutual: false })
  })
})

function harness(note: NotificationRow | null) {
  const store: NotificationStore = {
    listNotifications: vi.fn(async () => [row(), row({ id: 'n-2', type: 'friend_report', payload: {} })]),
    getNotification: vi.fn(async () => note),
    markRead: vi.fn(async () => undefined),
  }
  const api = createNotificationApi({ store, now: () => new Date('2026-10-31T11:00:00.000Z') })
  return { api, store }
}

describe('通知 API', () => {
  it('list：只讀自己的、最多 NOTIFICATION_LIST_LIMIT 則', async () => {
    const h = harness(null)
    const list = await h.api.list(ME)
    expect(list.map((n) => n.id)).toEqual(['n-1', 'n-2'])
    expect(h.store.listNotifications).toHaveBeenCalledWith(ME, NOTIFICATION_LIST_LIMIT)
  })

  it('markRead：match 設為已讀', async () => {
    const h = harness(row())
    await h.api.markRead('n-1', ME)
    expect(h.store.markRead).toHaveBeenCalledWith('n-1', ME, '2026-10-31T11:00:00.000Z')
  })

  it('markRead：friend_report、request_human 不能從這裡設已讀 → 400', async () => {
    for (const type of ['friend_report', 'request_human'] as const) {
      const h = harness(row({ type }))
      const err = await h.api.markRead('n-1', ME).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(ChatRoomError)
      expect((err as ChatRoomError).status).toBe(400)
      expect(h.store.markRead).not.toHaveBeenCalled()
    }
  })

  it('markRead：別人的通知或找不到 → 404', async () => {
    for (const note of [row({ user_id: 'someone' }), null]) {
      const err = await harness(note).api.markRead('n-1', ME).catch((e: unknown) => e)
      expect((err as ChatRoomError).status).toBe(404)
    }
  })
})
