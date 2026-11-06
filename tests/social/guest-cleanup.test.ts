import { describe, expect, it } from 'vitest'
import { cleanupGuests, guestCutoff, isExpiredGuest } from '../../server/account/guestCleanup'

const now = new Date('2026-11-10T00:00:00Z')
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString()

describe('游客自動刪除', () => {
  it('只刪建立超過 3 天、還沒設密碼的游客', () => {
    const cutoff = guestCutoff(now, 3)
    expect(isExpiredGuest({ id: 'a', created_at: daysAgo(4), app_metadata: { guest: true } }, cutoff)).toBe(true)
    expect(isExpiredGuest({ id: 'b', created_at: daysAgo(2), app_metadata: { guest: true } }, cutoff)).toBe(false)
    // 正式帳號、設了密碼的游客、舊的名字帳號都不刪
    expect(isExpiredGuest({ id: 'c', created_at: daysAgo(30), app_metadata: { guest: false, has_password: true } }, cutoff)).toBe(false)
    expect(isExpiredGuest({ id: 'd', created_at: daysAgo(30), app_metadata: { guest: true, has_password: true } }, cutoff)).toBe(false)
    expect(isExpiredGuest({ id: 'e', created_at: daysAgo(30), app_metadata: {} }, cutoff)).toBe(false)
  })

  it('一個刪失敗不影響其他人，一次最多刪 limit 個', async () => {
    const deleted: string[] = []
    const result = await cleanupGuests(
      {
        listExpiredGuests: async () => ['g1', 'bad', 'g2', 'g3'],
        deleteGuest: async (id) => {
          if (id === 'bad') throw new Error('fk')
          deleted.push(id)
        },
      },
      now,
      3,
    )
    expect(result).toEqual({ deleted: 2, failed: 1 })
    expect(deleted).toEqual(['g1', 'g2'])
  })
})
