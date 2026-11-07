import { expect, it, vi } from 'vitest'
import { applyChatResult, sendChatTurn } from '../../src/features/friend/chatState'
import type { FriendMessage, FriendChatResult } from '../../src/lib/api/friend'
const msg = (id: string, role: FriendMessage['role'] = 'user'): FriendMessage => ({ id, role, kind: 'chat', content: id, meta: {}, created_at: '2026-11-07T00:00:00Z' })
const result: FriendChatResult = { reply: 'hi', taskId: null, sharedEventId: null, messages: [msg('saved'), msg('reply', 'friend')] }
function deferred<T>() { let resolve!: (v: T) => void; let reject!: (e: Error) => void; const promise = new Promise<T>((a,b) => {resolve=a; reject=b}); return {promise,resolve,reject} }
function harness() {
  const state = { seq: 1, messages: [msg('old'), msg('tmp')] }
  const deps = { readSendSeq: () => state.seq, callFriendChat: vi.fn(async () => result), getFriendMessages: vi.fn(async () => result.messages!),
    setMessages: (update: (prev: FriendMessage[]) => FriendMessage[]) => { state.messages = update(state.messages) },
    onConfirmed: vi.fn(), onTask: vi.fn(), onError: vi.fn(), onSettled: vi.fn() }
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
