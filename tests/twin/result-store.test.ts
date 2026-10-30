// C5 結果頁 Supabase 版：狀態改動一定帶條件（只改該改的那一列），用假的 query builder 記下呼叫。
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface Call {
  table: string
  update: Record<string, unknown> | null
  filters: [string, unknown][]
}

const calls: Call[] = []

vi.mock('../../server/lib/supabase', () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      const call: Call = { table, update: null, filters: [] }
      calls.push(call)
      const builder = {
        update(patch: Record<string, unknown>) {
          call.update = patch
          return builder
        },
        eq(column: string, value: unknown) {
          call.filters.push([column, value])
          return builder
        },
        then(resolve: (v: { error: null }) => void) {
          resolve({ error: null })
        },
      }
      return builder
    },
  }),
}))

import { supabaseResultStore } from '../../server/twin/resultStore'

beforeEach(() => {
  calls.length = 0
})

describe('supabaseResultStore', () => {
  it('pauseConversation：只改 active 且雙方都是分身的那一列（有人本人接手就不改）', async () => {
    await supabaseResultStore().pauseConversation('conv-1')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      table: 'conversations',
      update: { status: 'waiting_human' },
      filters: [
        ['id', 'conv-1'],
        ['status', 'active'],
        ['side_a_controller', 'twin'],
        ['side_b_controller', 'twin'],
      ],
    })
  })

  it('resumeConversation：只改 waiting_human 的那一列', async () => {
    await supabaseResultStore().resumeConversation('conv-1')
    expect(calls[0]).toEqual({
      table: 'conversations',
      update: { status: 'active' },
      filters: [
        ['id', 'conv-1'],
        ['status', 'waiting_human'],
      ],
    })
  })
})
