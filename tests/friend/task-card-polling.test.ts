import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { FriendMessage } from '../../src/lib/api/friend'
import { createTaskCardPolling } from '../../src/features/friend/useTaskCardPolling'
import { initializeFriendPage } from '../../src/features/friend/chatInitialization'
import { mergeInitializedHistory } from '../../src/features/friend/chatState'

const since = '2026-11-07T00:00:10Z'
const card: FriendMessage = { id: 'card', role: 'friend', kind: 'task_card', content: '找人', meta: { taskId: 'task-1' }, created_at: '2026-11-07T00:00:12Z' }
const optimistic: FriendMessage = { id: 'tmp-next', role: 'user', kind: 'chat', content: '下一句话', meta: {}, created_at: '2026-11-07T00:00:13Z' }
function harness() {
  const state = { messages: [optimistic], version: 0 }
  const deps = {
    fetchMessages: vi.fn(async (): Promise<FriendMessage[]> => [card]),
    setMessages: vi.fn((update: (prev: FriendMessage[]) => FriendMessage[]) => { state.version++; state.messages = update(state.messages) }),
    onTask: vi.fn(), onPending: vi.fn(),
  }
  return { state, deps, polling: createTaskCardPolling(deps) }
}
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

it('merges a found card by id without erasing a newer optimistic send, opens its task', async () => {
  const h = harness()
  h.state.messages.unshift({ ...card, content: '现有版本' })
  const done = h.polling.start(since)
  expect(h.deps.onPending).toHaveBeenLastCalledWith(true)
  await vi.advanceTimersByTimeAsync(2_000)
  await done
  expect(h.state.messages.map(m => m.id)).toEqual(['card', 'tmp-next'])
  expect(h.state.messages[0]?.content).toBe('现有版本')
  expect(h.deps.onTask).toHaveBeenCalledExactlyOnceWith('task-1')
  expect(h.deps.onPending).toHaveBeenLastCalledWith(false)
})

it('merges a new task_failed message without opening a task confirmation', async () => {
  const h = harness()
  const failed = { ...card, id: 'failed', kind: 'chat', meta: { task_failed: true } }
  h.deps.fetchMessages.mockResolvedValue([failed])
  const done = h.polling.start(since)
  await vi.advanceTimersByTimeAsync(2_000)
  await done
  expect(h.state.messages).toContainEqual(failed)
  expect(h.state.messages).toContainEqual(optimistic)
  expect(h.deps.onTask).not.toHaveBeenCalled()
  expect(h.deps.onPending).toHaveBeenLastCalledWith(false)
})

it('unmount cancellation stops requests and all late UI callbacks', async () => {
  const h = harness()
  const done = h.polling.start(since)
  h.polling.stop()
  await vi.advanceTimersByTimeAsync(30_000)
  await done
  expect(h.deps.fetchMessages).not.toHaveBeenCalled()
  expect(h.deps.setMessages).not.toHaveBeenCalled()
  expect(h.deps.onTask).not.toHaveBeenCalled()
  expect(h.deps.onPending.mock.calls).toEqual([[true]])
  expect(vi.getTimerCount()).toBe(0)
})

it('an in-flight response after unmount cannot merge messages or open a card', async () => {
  const h = harness()
  let resolve!: (rows: FriendMessage[]) => void
  h.deps.fetchMessages.mockReturnValueOnce(new Promise(r => { resolve = r }))
  const done = h.polling.start(since)
  await vi.advanceTimersByTimeAsync(2_000)
  h.polling.stop()
  resolve([card])
  await done
  expect(h.state.messages).toEqual([optimistic])
  expect(h.deps.onTask).not.toHaveBeenCalled()
})

it('timeout only clears taskPending, leaves chat intact and displays no error', async () => {
  const h = harness()
  h.deps.fetchMessages.mockRejectedValue(new Error('offline'))
  const done = h.polling.start(since)
  await vi.advanceTimersByTimeAsync(30_000)
  await done
  expect(h.state.messages).toEqual([optimistic])
  expect(h.deps.setMessages).not.toHaveBeenCalled()
  expect(h.deps.onTask).not.toHaveBeenCalled()
  expect(h.deps.onPending.mock.calls).toEqual([[true], [false]])
  expect(vi.getTimerCount()).toBe(0)
})

it.each([false, true])('overlapping pending turns consume distinct cards in either completion order (reversed=%s)', async (reversed) => {
  const h = harness()
  const first = { ...card, created_at: '2026-11-07T00:00:22Z' }
  const second = { ...card, id: 'card-2', meta: { taskId: 'task-2' }, created_at: '2026-11-07T00:00:24Z' }
  const early = reversed ? second : first, late = reversed ? first : second
  h.deps.fetchMessages.mockResolvedValue([early])
  const a = h.polling.start(since)
  const b = h.polling.start('2026-11-07T00:00:20Z')
  await vi.advanceTimersByTimeAsync(2_000)
  expect(h.deps.onTask).toHaveBeenCalledTimes(1)
  expect(h.deps.onPending).toHaveBeenLastCalledWith(true)
  h.deps.fetchMessages.mockResolvedValue([early, late])
  await vi.advanceTimersByTimeAsync(2_000)
  await Promise.all([a, b])
  expect(h.deps.onTask.mock.calls).toEqual(reversed ? [['task-2'], ['task-1']] : [['task-1'], ['task-2']])
  expect(h.state.messages).toContainEqual(second)
  expect(h.deps.onPending).toHaveBeenLastCalledWith(false)
})

it('overlapping turns also consume task_failed only once and continue for the other task', async () => {
  const h = harness()
  const failed = { ...card, id: 'failed', kind: 'chat', meta: { task_failed: true }, created_at: '2026-11-07T00:00:22Z' }
  const later = { ...card, created_at: '2026-11-07T00:00:24Z' }
  h.deps.fetchMessages.mockResolvedValue([failed])
  const a = h.polling.start(since), b = h.polling.start('2026-11-07T00:00:20Z')
  await vi.advanceTimersByTimeAsync(2_000)
  expect(h.deps.onPending).toHaveBeenLastCalledWith(true)
  h.deps.fetchMessages.mockResolvedValue([failed, later])
  await vi.advanceTimersByTimeAsync(2_000)
  await Promise.all([a, b])
  expect(h.deps.onTask).toHaveBeenCalledExactlyOnceWith('task-1')
  expect(h.state.messages).toContainEqual(failed)
  expect(h.state.messages).toContainEqual(later)
})

it('an initialization snapshot started before polling commits cannot erase the newly merged card', async () => {
  const h = harness()
  let resolve!: (rows: FriendMessage[]) => void
  const snapshot = new Promise<FriendMessage[]>(r => { resolve = r })
  const fetch = vi.fn(() => snapshot)
  const init = initializeFriendPage({
    callFriendIntro: async () => {}, deliverReports: async () => 0, fetchSettings: async () => null,
    getFriendMessages: fetch, readSendSeq: () => 1, readMessageVersion: () => h.state.version,
    isSending: () => false, hasUnconfirmedSend: () => false, isActive: () => true,
    onMessages: rows => { h.state.messages = rows },
    onStaleMessages: rows => { h.state.messages = mergeInitializedHistory(h.state.messages, rows) },
    onSettings: () => {}, onMessagesError: vi.fn(),
  })
  await vi.advanceTimersByTimeAsync(0)
  expect(fetch).toHaveBeenCalledOnce()
  const done = h.polling.start(since)
  await vi.advanceTimersByTimeAsync(2_000)
  await done
  expect(h.state.messages).toContainEqual(card)
  resolve([optimistic])
  await init
  expect(h.state.messages).toContainEqual(card)
  expect(h.state.messages).toContainEqual(optimistic)
})
