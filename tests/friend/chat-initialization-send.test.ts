import { expect, it, vi } from 'vitest'
import { initializeFriendPage } from '../../src/features/friend/chatInitialization'
import { mergeInitializedHistory, sendChatTurn } from '../../src/features/friend/chatState'
import type { FriendMessage } from '../../src/lib/api/friend'
const msg = (id: string, content = id): FriendMessage => ({ id, role: 'friend', kind: 'chat', content, meta: {}, created_at: '2026-11-07T00:00:00Z' })
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
it('keeps initial history, intro and reports when POST finishes before a stale init GET', async () => {
  const snapshot = deferred<FriendMessage[]>()
  let seq = 0; let rows: FriendMessage[] = []
  const setRows = (fn: (prev: FriendMessage[]) => FriendMessage[]) => { rows = fn(rows) }
  const getInitial = vi.fn(() => snapshot.promise)
  const initial = initializeFriendPage({
    callFriendIntro: async () => {}, deliverReports: async () => 1, fetchSettings: async () => null,
    getFriendMessages: getInitial, readSendSeq: () => seq, isSending: () => false,
    hasUnconfirmedSend: () => false, isActive: () => true,
    onMessages: value => { rows = value }, onStaleMessages: value => setRows(prev => mergeInitializedHistory(prev, value)),
    onSettings: () => {}, onMessagesError: () => {},
  })
  await vi.waitFor(() => expect(getInitial).toHaveBeenCalled())
  seq = 1; rows.push({ ...msg('tmp'), role: 'user' })
  const getAfterSend = vi.fn(async () => [] as FriendMessage[])
  await sendChatTurn('hi', 'tmp', seq, {
    readSendSeq: () => seq, setMessages: setRows,
    callFriendChat: async () => ({ reply: 'new', taskId: null, sharedEventId: null, messages: [{ ...msg('user'), role: 'user' }, msg('reply', 'new')] }),
    getFriendMessages: getAfterSend, onConfirmed: () => {}, onTask: () => {}, onError: () => {}, onSettled: () => {},
  })
  snapshot.resolve([msg('old'), msg('intro'), msg('report'), msg('reply', 'stale')]); await initial
  expect(rows.map(row => row.id)).toEqual(['old', 'intro', 'report', 'user', 'reply'])
  expect(rows.find(row => row.id === 'reply')?.content).toBe('new')
  expect(getAfterSend).not.toHaveBeenCalled()
})
it('never drops an unconfirmed failed temporary message while merging init history', () => {
  const temporary = { ...msg('tmp'), meta: { failed: true } }
  expect(mergeInitializedHistory([temporary], [msg('old')])).toEqual([msg('old'), temporary])
})
