/**
 * A5：模擬下次見面測試。
 * 必測：pickNextEvent 的解鎖規則、getLifeUpdate 超出範圍時的行為。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { pickNextEvent, getLifeUpdate, EVENTS, LIFE_UPDATES } from '../../server/friend/persona'
import { nextMeet, NextMeetError } from '../../server/friend/nextMeet'
import * as supabaseLib from '../../server/lib/supabase'
import * as memoryLib from '../../server/friend/memory'
import { setLogWriter } from '../../server/lib/log'

describe('persona 純函式（必測）', () => {
  describe('pickNextEvent', () => {
    it('解鎖規則：stage 0 只能拿到 unlockStage 0 的事件', () => {
      const evt = pickNextEvent(0, [])
      expect(evt).not.toBeNull()
      expect(evt!.unlockStage).toBe(0)
      expect(['e1_exhibition', 'e2_fanart']).toContain(evt!.id)
    })

    it('解鎖規則：stage 1 可以拿到 stage 0 或 1 的事件', () => {
      const evt = pickNextEvent(1, ['e1_exhibition', 'e2_fanart'])
      expect(evt).not.toBeNull()
      expect(evt!.unlockStage).toBeLessThanOrEqual(1)
      expect(['e3_roommate', 'e4_loan']).toContain(evt!.id)
    })

    it('不重複：已分享過的事件不會再挑到', () => {
      const evt = pickNextEvent(0, ['e1_exhibition'])
      expect(evt).not.toBeNull()
      expect(evt!.id).toBe('e2_fanart')
    })

    it('沒有可分享的事件時回 null', () => {
      const allIds = EVENTS.map((e) => e.id)
      const evt = pickNextEvent(0, allIds)
      expect(evt).toBeNull()
    })
  })

  describe('getLifeUpdate（必測）', () => {
    it('stage 0 回傳第一個近況', () => {
      const update = getLifeUpdate(0)
      expect(update).toBe(LIFE_UPDATES[0])
      expect(update.opener).toBe('')
    })

    it('stage 1 回傳第二個近況', () => {
      const update = getLifeUpdate(1)
      expect(update).toBe(LIFE_UPDATES[1])
      expect(update.opener).toContain('上次')
    })

    it('超過最大階段時停在最後一個', () => {
      const maxIdx = LIFE_UPDATES.length - 1
      const update = getLifeUpdate(999)
      expect(update).toBe(LIFE_UPDATES[maxIdx])
    })
  })
})

describe('nextMeet 整合', () => {
  let mockDb: any
  let insertCalls: any[] = []
  let updateCalls: any[] = []

  beforeEach(() => {
    insertCalls = []
    updateCalls = []

    mockDb = {
      from: (table: string) => ({
        select: () => {
          if (table === 'ai_friends') {
            return {
              eq: () => ({
                single: () => Promise.resolve({
                  data: { story_stage: 0, shared_event_ids: [] },
                  error: null,
                }),
              }),
            }
          }
          if (table === 'friend_memories') {
            return {
              eq: () => ({
                is: () => ({
                  order: () => ({
                    limit: () => Promise.resolve({ data: [], error: null }),
                  }),
                }),
              }),
            }
          }
          if (table === 'notifications') {
            return {
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    order: () => Promise.resolve({ data: [], error: null }),
                  }),
                }),
              }),
            }
          }
          return {
            eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
          }
        },
        insert: (data: any) => {
          insertCalls.push({ table, data })
          return { error: null }
        },
        update: (data: any) => {
          updateCalls.push({ table, data })
          return { eq: () => ({ error: null }) }
        },
      }),
    }

    vi.spyOn(supabaseLib, 'getServiceClient').mockReturnValue(mockDb as any)
    vi.spyOn(memoryLib, 'listMemories').mockResolvedValue([])
    setLogWriter(async () => { })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    supabaseLib.resetServiceClientForTest()
    setLogWriter(null)
  })

  it('應該 story_stage + 1 並更新 life_state', async () => {
    await nextMeet('test-user')
    const aiUpdate = updateCalls.find((c) => c.table === 'ai_friends')
    expect(aiUpdate).toBeDefined()
    expect(aiUpdate.data.story_stage).toBe(1)
  })

  it('應該存入近況訊息', async () => {
    await nextMeet('test-user')
    const lifeMsg = insertCalls.find((c) => c.table === 'friend_messages' && c.data.kind === 'life_update')
    expect(lifeMsg).toBeDefined()
  })

  it('DB 查詢失敗時拋 NextMeetError', async () => {
    mockDb.from = () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: { message: 'DB error' } }),
        }),
      }),
    })
    await expect(nextMeet('test-user')).rejects.toThrow(NextMeetError)
  })
})