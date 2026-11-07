import { afterEach, expect, it, vi } from 'vitest'
import { applyChatResult, findTaskCardAfter, pollTaskCard, sendChatTurn } from '../../src/features/friend/chatState'
import type { FriendMessage, FriendChatResult } from '../../src/lib/api/friend'
const msg = (id: string, role: FriendMessage['role'] = 'user'): FriendMessage => ({ id, role, kind: 'chat', content: id, meta: {}, created_at: '2026-11-07T00:00:00Z' })
const result: FriendChatResult = { reply: 'hi', taskId: null, sharedEventId: null, messages: [msg('saved'), msg('reply', 'friend')] }
function deferred<T>() { let resolve!: (v: T) => void; let reject!: (e: Error) => void; const promise = new Promise<T>((a,b) => {resolve=a; reject=b}); return {promise,resolve,reject} }
function harness() {
  const state = { seq: 1, messages: [msg('old'), msg('tmp')] }
  const deps = { readSendSeq: () => state.seq, callFriendChat: vi.fn(async () => result), getFriendMessages: vi.fn(async () => result.messages!),
    setMessages: (update: (prev: FriendMessage[]) => FriendMessage[]) => { state.messages = update(state.messages) },
    onConfirmed: vi.fn(), onTask: vi.fn(), onTaskPending: vi.fn(), onError: vi.fn(), onSettled: vi.fn() }
  return { state, deps }
}
it('replaces only this temporary row, deduplicates and preserves other messages', () => {
  expect(applyChatResult([msg('old'), msg('tmp'), msg('newer')], 'tmp', result)?.map(m => m.id)).toEqual(['old','newer','saved','reply'])
  expect(applyChatResult(result.messages!, 'missing', result)).toHaveLength(2)
  expect(applyChatResult([], 'tmp', { ...result, messages: undefined })).toBeNull()
})
it('uses POST messages without a success GET; legacy replies fall back to GET', async () => {
  const h = harness(); await sendChatTurn('hi', 'tmp', 1, h.deps)
  expect(h.deps.getFriendMessages).not.toHaveBeenCalled()
  expect(h.state.messages.map(m => m.id)).toEqual(['old','saved','reply'])
  h.deps.callFriendChat.mockResolvedValueOnce({ ...result, messages: undefined })
  await sendChatTurn('hi', 'tmp', 1, h.deps)
  expect(h.deps.getFriendMessages).toHaveBeenCalledOnce()
})
it('ignores an old POST response after a newer send starts', async () => {
  const h = harness(); const pending = deferred<FriendChatResult>()
  h.deps.callFriendChat.mockReturnValueOnce(pending.promise)
  const done = sendChatTurn('hi', 'tmp', 1, h.deps)
  h.state.seq = 2; h.state.messages.push(msg('newer'))
  pending.resolve(result); await done
  expect(h.state.messages.map(m => m.id)).toEqual(['old','tmp','newer'])
  expect(h.deps.onConfirmed).not.toHaveBeenCalled(); expect(h.deps.onSettled).not.toHaveBeenCalled()
})
it('ignores stale legacy or failure recovery GET responses', async () => {
  for (const failed of [false, true]) {
    const h = harness(); const pending = deferred<FriendMessage[]>()
    if (failed) h.deps.callFriendChat.mockRejectedValueOnce(new Error('failed'))
    else h.deps.callFriendChat.mockResolvedValueOnce({ ...result, messages: undefined })
    h.deps.getFriendMessages.mockReturnValueOnce(pending.promise)
    const done = sendChatTurn('hi', 'tmp', 1, h.deps)
    await vi.waitFor(() => expect(h.deps.getFriendMessages).toHaveBeenCalled())
    h.state.seq = 2; h.state.messages.push(msg('newer')); pending.resolve([msg('stale')]); await done
    expect(h.state.messages.map(m => m.id)).toEqual(['old','tmp','newer'])
    expect(h.deps.onConfirmed).not.toHaveBeenCalled()
  }
})
it('preserves X-1 failed text when recovery GET fails and confirms a successful recovery', async () => {
  const h = harness(); h.deps.callFriendChat.mockRejectedValueOnce(new Error('failed'))
  h.deps.getFriendMessages.mockRejectedValueOnce(new Error('offline'))
  await sendChatTurn('hi', 'tmp', 1, h.deps)
  expect(h.state.messages.find(m => m.id === 'tmp')?.meta.failed).toBe(true)
  expect(h.deps.onConfirmed).not.toHaveBeenCalled()
  h.deps.callFriendChat.mockRejectedValueOnce(new Error('failed'))
  await sendChatTurn('hi', 'tmp', 1, h.deps)
  expect(h.state.messages).toEqual(result.messages)
  expect(h.deps.onConfirmed).toHaveBeenCalledOnce()
})

it('ignores stale POST failure and protects deferred state updater execution', async () => {
  const h = harness(); const post = deferred<FriendChatResult>()
  h.deps.callFriendChat.mockReturnValueOnce(post.promise)
  const done = sendChatTurn('hi', 'tmp', 1, h.deps)
  h.state.seq = 2; post.reject(new Error('old failure')); await done
  expect(h.deps.getFriendMessages).not.toHaveBeenCalled()
  expect(h.deps.onError).not.toHaveBeenCalled()
  const next = harness(); let update!: (prev: FriendMessage[]) => FriendMessage[]
  next.deps.setMessages = fn => { update = fn }
  await sendChatTurn('hi', 'tmp', 1, next.deps)
  next.state.seq = 2
  expect(update([msg('newer')])).toEqual([msg('newer')])
})

afterEach(() => vi.useRealTimers())
const since = '2026-11-07T00:00:10.000Z'
const taskCard = (id = 'card', at = '2026-11-07T00:00:11.000Z'): FriendMessage => ({
  ...msg(id, 'friend'), kind: 'task_card', meta: { taskId: `task-${id}` }, created_at: at,
})

it('findTaskCardAfter ignores earlier cards and ordinary messages, finds task failure too', () => {
  const older = taskCard('old', '2026-11-07T00:00:09.999Z')
  const failed = { ...msg('failed', 'friend'), meta: { task_failed: true }, created_at: since }
  expect(findTaskCardAfter([older, msg('chat', 'friend')], since)).toBeNull()
  expect(findTaskCardAfter([older, taskCard()], since)?.id).toBe('card')
  expect(findTaskCardAfter([older, failed], since)).toEqual(failed)
  expect(findTaskCardAfter([taskCard()], 'invalid')).toBeNull()
  expect(findTaskCardAfter([{ ...taskCard(), role: 'user' }], since)).toBeNull()
})

it('findTaskCardAfter preserves PostgreSQL microseconds when excluding earlier cards', () => {
  const cutoff = '2026-11-07T00:00:10.123456+00:00'
  const earlier = taskCard('earlier', '2026-11-07T00:00:10.123455+00:00')
  const later = taskCard('later', '2026-11-07T00:00:10.123457+00:00')
  expect(findTaskCardAfter([earlier, later], cutoff)?.id).toBe('later')
})

it('pollTaskCard finds the card only on the third request and leaves no timers', async () => {
  vi.useFakeTimers()
  const fetch = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValue([taskCard()])
  const pending = pollTaskCard(fetch, since, {})
  await vi.advanceTimersByTimeAsync(4_000)
  expect(fetch).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(2_000)
  expect(await pending).toEqual(taskCard())
  expect(fetch).toHaveBeenCalledTimes(3)
  expect(vi.getTimerCount()).toBe(0)
})

it('pollTaskCard times out silently and never makes requests after timeout', async () => {
  vi.useFakeTimers()
  const fetch = vi.fn(async () => [])
  const pending = pollTaskCard(fetch, since, { intervalMs: 10, timeoutMs: 35 })
  await vi.advanceTimersByTimeAsync(35)
  expect(await pending).toBeNull()
  expect(fetch).toHaveBeenCalledTimes(3)
  await vi.advanceTimersByTimeAsync(100)
  expect(fetch).toHaveBeenCalledTimes(3)
  expect(vi.getTimerCount()).toBe(0)
})

it('pollTaskCard notices cancellation before fetching and after an in-flight GET', async () => {
  vi.useFakeTimers()
  let cancelled = false
  const request = deferred<FriendMessage[]>()
  const fetch = vi.fn(() => request.promise)
  const pending = pollTaskCard(fetch, since, { intervalMs: 10, isCancelled: () => cancelled })
  await vi.advanceTimersByTimeAsync(10)
  expect(fetch).toHaveBeenCalledOnce()
  cancelled = true
  await vi.advanceTimersByTimeAsync(10)
  expect(await pending).toBeNull()
  request.resolve([taskCard()])
  await vi.advanceTimersByTimeAsync(100)
  expect(fetch).toHaveBeenCalledOnce()
  expect(await pollTaskCard(fetch, since, { isCancelled: () => true })).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
})

it('a failed GET is skipped and a later task_failed message stops polling', async () => {
  vi.useFakeTimers()
  const failure = { ...msg('failed', 'friend'), meta: { task_failed: true }, created_at: since }
  const fetch = vi.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('offline')).mockResolvedValue([failure])
  const pending = pollTaskCard(fetch, since, { intervalMs: 10 })
  await vi.advanceTimersByTimeAsync(30)
  expect(await pending).toEqual(failure)
  expect(fetch).toHaveBeenCalledTimes(3)
})

it('a GET that never completes still times out without overlapping requests', async () => {
  vi.useFakeTimers()
  const request = deferred<FriendMessage[]>()
  const fetch = vi.fn(() => request.promise)
  const pending = pollTaskCard(fetch, since, { intervalMs: 10, timeoutMs: 35 })
  await vi.advanceTimersByTimeAsync(35)
  expect(await pending).toBeNull()
  expect(fetch).toHaveBeenCalledOnce()
  request.resolve([taskCard()])
  await vi.advanceTimersByTimeAsync(0)
  expect(vi.getTimerCount()).toBe(0)
})

it('onTaskPending uses the reply server created_at, never the client clock', async () => {
  const h = harness()
  h.deps.callFriendChat.mockResolvedValueOnce({ ...result, taskPending: true,
    messages: [msg('user'), { ...msg('reply', 'friend'), created_at: since }] })
  await sendChatTurn('hi', 'tmp', 1, h.deps)
  expect(h.deps.onTaskPending).toHaveBeenCalledExactlyOnceWith(since)
  expect(h.deps.onTask).not.toHaveBeenCalled()
  const normal = harness()
  await sendChatTurn('hi', 'tmp', 1, normal.deps)
  expect(normal.deps.onTaskPending).not.toHaveBeenCalled()
})

it('a stale taskPending POST cannot start a poll', async () => {
  const h = harness(), pending = deferred<FriendChatResult>()
  h.deps.callFriendChat.mockReturnValueOnce(pending.promise)
  const done = sendChatTurn('hi', 'tmp', 1, h.deps)
  h.state.seq++
  pending.resolve({ ...result, taskPending: true })
  await done
  expect(h.deps.onTaskPending).not.toHaveBeenCalled()
})
