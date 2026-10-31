import { describe, expect, it } from 'vitest'
import type { AgentTask } from '../../shared/types'
import { MemoryAgentStore } from '../../server/social/agentStore'
import { buildReport } from '../../server/social/report'
import { computeStats, formatDuration } from '../../server/social/stats'
import { formatDuration as formatDurationUi } from '../../src/features/social/formatDuration'

describe('computeStats', () => {
  it('省下的時間 = 代聊場數 × 人工平均，附計算依據', () => {
    expect(computeStats({ screened: 20, chats: 6, suitable: 2 }, 20)).toEqual({
      screened: 20,
      chats: 6,
      suitable: 2,
      saved_minutes: 120,
      basis: '代聊 6 场 × 人工平均 20 分钟',
    })
  })
})

describe('formatDuration', () => {
  it('分鐘換成小時與分鐘；前後端一致', () => {
    for (const fmt of [formatDuration, formatDurationUi]) {
      expect(fmt(120)).toBe('约 2 小时')
      expect(fmt(150)).toBe('约 2 小时 30 分钟')
      expect(fmt(45)).toBe('约 45 分钟')
      expect(fmt(0)).toBe('约 0 分钟')
    }
  })
})

describe('buildReport', () => {
  const task: AgentTask = {
    id: 't1', user_id: 'me', kind: 'search', raw_instruction: null, restatement: null, purpose: 'sport', conditions: [],
    target_count: 3, done_condition: {}, target_user_id: null, status: 'done', progress: { screened: 20, chats: 3, suitable: 1 },
    active_conversation_id: null, attempted_user_ids: [],
  }
  const outline = { topics: [], fits: [], frictions: [], highlights: [], fit_points: [] }

  it('只取這個任務的嘗試：合適名單、不合適原因、效率統計，不含任何分數', async () => {
    const store = new MemoryAgentStore()
    const add = (task_id: string, target: string, result: 'mutual' | 'one_way' | 'unsuitable', reason: 'friction' | null = null) =>
      store.recordAttempt({ user_id: 'me', target_user_id: target, conversation_id: `c-${target}`, task_id, origin: 'auto', result, reason_type: reason, reason_text: reason ? '节奏没对上' : null, outline })
    await add('t1', 'an', 'mutual')
    await add('t1', 'zhe', 'unsuitable', 'friction')
    await add('t1', 'qing', 'one_way')
    await add('other-task', 'x', 'mutual')

    const report = await buildReport(task, store)
    expect(report.suitable).toEqual([
      { user_id: 'an', display_name: 'an（真人）', mutual: true, conversation_id: 'c-an', is_seed: false },
      { user_id: 'qing', display_name: 'qing（真人）', mutual: false, conversation_id: 'c-qing', is_seed: false },
    ].reverse())
    expect(report.unsuitable_reasons).toEqual([{ reason_type: 'friction', reason_text: '节奏没对上' }])
    expect(report).toMatchObject({ screened: 20, chats: 3, saved_minutes: 60, basis: '代聊 3 场 × 人工平均 20 分钟' })
    expect(JSON.stringify(report)).not.toMatch(/score/)
  })

  it('名字標「真人／示范用户」，真人排前面', async () => {
    const store = new MemoryAgentStore()
    store.seedUserIds.add('seed-qing')
    for (const target of ['seed-qing', 'real-an']) {
      await store.recordAttempt({ user_id: 'me', target_user_id: target, conversation_id: `c-${target}`, task_id: 't1', origin: 'auto', result: 'mutual', reason_type: null, reason_text: null, outline })
    }
    const report = await buildReport(task, store)
    expect(report.suitable.map((s) => [s.display_name, s.is_seed])).toEqual([
      ['real-an（真人）', false],
      ['seed-qing（示范用户）', true],
    ])
  })
})
