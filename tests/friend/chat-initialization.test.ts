import { describe, expect, it, vi } from 'vitest'
import { initializeFriendPage, shouldApplyInitMessages } from '../../src/features/friend/chatInitialization'
import { reconcileChatFailure } from '../../src/features/friend/chatFailure'
import type { FriendMessage } from '../../src/lib/api/friend'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
const message = (id: string, role: FriendMessage['role']): FriendMessage => ({
  id, role, kind: 'chat', content: '你好', meta: {}, created_at: '2026-11-07T00:00:00Z',
})

function harness() {
  const intro = deferred<void>()
  const reports = deferred<number>()
  const messages = deferred<FriendMessage[]>()
  const settings = deferred<null>()
  const state = { seq: 0, active: true, sending: false, unconfirmed: false, list: [] as FriendMessage[] }
  const deps = {
    callFriendIntro: vi.fn(() => intro.promise), deliverReports: vi.fn(() => reports.promise),
    getFriendMessages: vi.fn(() => messages.promise), fetchSettings: vi.fn(() => settings.promise),
    readSendSeq: () => state.seq, isActive: () => state.active, isSending: () => state.sending,
    hasUnconfirmedSend: () => state.unconfirmed,
    onMessages: vi.fn((rows: FriendMessage[]) => { state.list = rows }),
    onSettings: vi.fn(), onMessagesError: vi.fn(),
  }
  return { intro, reports, messages, settings, state, deps }
}

describe('friend initialization ordering', () => {
  it('starts settings immediately and waits for both intro and reports before reading messages', async () => {
    const h = harness()
    const done = initializeFriendPage(h.deps)
    expect(h.deps.fetchSettings).toHaveBeenCalledOnce()
    expect(h.deps.callFriendIntro).toHaveBeenCalledOnce()
    expect(h.deps.deliverReports).toHaveBeenCalledOnce()
    expect(h.deps.getFriendMessages).not.toHaveBeenCalled()
    h.settings.resolve(null)
    await flush()
    expect(h.deps.onSettings).toHaveBeenCalledWith(null)
    h.intro.resolve()
    await flush()
    expect(h.deps.getFriendMessages).not.toHaveBeenCalled()
    h.reports.resolve(0)
    await flush()
    expect(h.deps.getFriendMessages).toHaveBeenCalledOnce()
    const rows = [message('friend-1', 'friend')]
    h.messages.resolve(rows)
    await done
    expect(h.state.list).toEqual(rows)
  })

  it('keeps intro, report and settings failures nonfatal to the message load', async () => {
    const h = harness()
    const done = initializeFriendPage(h.deps)
    h.intro.reject(new Error('intro failed'))
    h.reports.reject(new Error('reports failed'))
    h.settings.reject(new Error('settings failed'))
    h.messages.resolve([])
    await done
    expect(h.deps.onMessages).toHaveBeenCalledWith([])
    expect(h.deps.onSettings).not.toHaveBeenCalled()
  })

  it('reports a failed history read without replacing messages', async () => {
    const h = harness()
    const done = initializeFriendPage(h.deps)
    h.intro.resolve(); h.reports.resolve(0); h.settings.resolve(null)
    await flush()
    const error = new Error('history failed')
    h.messages.reject(error)
    await done
    expect(h.deps.onMessagesError).toHaveBeenCalledWith(error)
    expect(h.deps.onMessages).not.toHaveBeenCalled()
  })

  it.each(['before recovery', 'after recovery'])('does not overwrite optimistic text when stale init arrives %s', async timing => {
    const h = harness()
    const done = initializeFriendPage(h.deps)
    h.intro.resolve(); h.reports.resolve(0); h.settings.resolve(null)
    await flush()
    h.state.seq++
    h.state.list = [message('tmp-1', 'user')]
    if (timing === 'after recovery') h.state.list = reconcileChatFailure(h.state.list, 'tmp-1', null)
    h.messages.resolve([message('old-friend', 'friend')])
    await done
    if (timing === 'before recovery') h.state.list = reconcileChatFailure(h.state.list, 'tmp-1', null)
    expect(h.state.list).toEqual([{ ...message('tmp-1', 'user'), meta: { failed: true } }])
    expect(h.deps.onMessages).not.toHaveBeenCalled()
  })

  it('also rejects init history when the send starts before the init GET is dispatched', async () => {
    const h = harness()
    const done = initializeFriendPage(h.deps)
    h.state.seq++
    h.state.sending = true
    h.state.list = [message('tmp-1', 'user')]
    h.intro.resolve(); h.reports.resolve(0); h.settings.resolve(null)
    h.messages.resolve([])
    await done
    expect(h.state.list).toEqual([message('tmp-1', 'user')])
    expect(h.deps.onMessages).not.toHaveBeenCalled()
  })

  it('does not update state after cleanup', async () => {
    const h = harness()
    const done = initializeFriendPage(h.deps)
    h.state.active = false
    h.intro.resolve(); h.reports.resolve(0); h.settings.resolve(null); h.messages.resolve([])
    await done
    expect(h.deps.onMessages).not.toHaveBeenCalled()
    expect(h.deps.onSettings).not.toHaveBeenCalled()
  })

  it('accepts a newer report snapshot read after a successful send and its history refresh finish', async () => {
    const h = harness()
    const done = initializeFriendPage(h.deps)
    h.intro.resolve(); h.settings.resolve(null)
    h.state.seq++
    h.state.list = [message('old', 'friend'), message('saved-user', 'user'), message('reply', 'friend')]
    h.state.sending = false
    h.state.unconfirmed = false
    const server = [...h.state.list, { ...message('report', 'friend'), kind: 'report' }]
    h.reports.resolve(1)
    await flush()
    expect(h.deps.getFriendMessages).toHaveBeenCalledOnce()
    h.messages.resolve(server)
    await done
    expect(h.state.list).toEqual(server)
  })

  it('keeps failed local text if a send is over but its server history was never confirmed', async () => {
    const h = harness()
    h.state.seq = 1
    h.state.unconfirmed = true
    h.state.list = [{ ...message('tmp-1', 'user'), meta: { failed: true } }]
    const done = initializeFriendPage(h.deps)
    h.intro.resolve(); h.reports.resolve(0); h.settings.resolve(null); h.messages.resolve([])
    await done
    expect(h.state.list).toEqual([{ ...message('tmp-1', 'user'), meta: { failed: true } }])
    expect(h.deps.onMessages).not.toHaveBeenCalled()
  })

  it('does not overwrite a send already in flight when a new initialization starts', async () => {
    const h = harness()
    h.state.seq = 1
    h.state.sending = true
    h.state.list = [message('tmp-1', 'user')]
    const done = initializeFriendPage(h.deps)
    h.intro.resolve(); h.reports.resolve(0); h.settings.resolve(null)
    await flush()
    h.state.list = reconcileChatFailure(h.state.list, 'tmp-1', null)
    h.state.sending = false
    h.messages.resolve([])
    await done
    expect(h.state.list).toEqual([{ ...message('tmp-1', 'user'), meta: { failed: true } }])
    expect(h.deps.onMessages).not.toHaveBeenCalled()
  })

  it('accepts unchanged send sequences and rejects changed ones', () => {
    expect(shouldApplyInitMessages(0, 0)).toBe(true)
    expect(shouldApplyInitMessages(0, 1)).toBe(false)
    expect(shouldApplyInitMessages(1, 1, true)).toBe(false)
  })
})
