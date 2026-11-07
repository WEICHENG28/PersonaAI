import { describe, expect, it } from 'vitest'
import type { FriendMessage } from '../../src/lib/api/friend'
import { reconcileChatFailure, shouldScheduleNudge } from '../../src/features/friend/chatFailure'

const message = (id: string, role: FriendMessage['role'], meta: FriendMessage['meta'] = {}): FriendMessage => ({
  id, role, kind: 'chat', content: role === 'user' ? '周末去散步' : '好啊', meta,
  created_at: '2026-11-07T00:00:00.000Z',
})

describe('failed friend chat reconciliation', () => {
  it('uses server history after a failed send when the user message was saved', () => {
    const optimistic = [message('friend-1', 'friend'), message('tmp-1', 'user')]
    const server = [message('friend-1', 'friend'), message('saved-1', 'user')]
    const recovered = reconcileChatFailure(optimistic, 'tmp-1', server)
    expect(recovered).toEqual(server)
    expect(recovered.some(m => m.id === 'tmp-1')).toBe(false)
  })

  it('accepts server history without the user message, including an empty list', () => {
    const optimistic = [message('tmp-1', 'user')]
    expect(reconcileChatFailure(optimistic, 'tmp-1', [])).toEqual([])
    const server = [message('friend-1', 'friend')]
    expect(reconcileChatFailure(optimistic, 'tmp-1', server)).toEqual(server)
  })

  it('retains the temporary message and existing metadata when history reload also fails', () => {
    const previous = message('user-0', 'user')
    const pending = message('tmp-1', 'user', { local: true })
    const optimistic = [previous, pending]
    const recovered = reconcileChatFailure(optimistic, 'tmp-1', null)
    expect(recovered).toEqual([previous, { ...pending, meta: { local: true, failed: true } }])
    expect(recovered[0]).toBe(previous)
    expect(pending.meta).toEqual({ local: true })
    expect(optimistic).toEqual([previous, pending])
  })
})

describe('nudge after a failed send', () => {
  const messages = [message('user-1', 'user'), message('friend-1', 'friend')]

  it.each(['出了点问题，再试一次？', ''])('does not schedule while httpError is non-null: %j', httpError => {
    expect(shouldScheduleNudge({ messages, httpError })).toBe(false)
  })

  it('allows the original nudge rule again after the error is cleared', () => {
    expect(shouldScheduleNudge({ messages, httpError: null })).toBe(true)
  })

  it('does not schedule for an empty history or when the user spoke last', () => {
    expect(shouldScheduleNudge({ messages: [], httpError: null })).toBe(false)
    expect(shouldScheduleNudge({ messages: [message('user-1', 'user')], httpError: null })).toBe(false)
  })

  it('does not repeat a nudge after the most recent user message', () => {
    expect(shouldScheduleNudge({
      messages: [...messages, message('nudge-1', 'friend', { nudge: true }), message('friend-2', 'friend')],
      httpError: null,
    })).toBe(false)
  })

  it('ignores nudges from before the latest user message', () => {
    expect(shouldScheduleNudge({
      messages: [message('nudge-0', 'friend', { nudge: true }), ...messages], httpError: null,
    })).toBe(true)
  })
})
