import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadLobbyInviteAfterMessages, loadOnboardingAfterMessages } from '../../src/features/social/messageLoaders'
import { getLobbyInvite, getOnboarding } from '../../src/lib/api/social'

vi.mock('../../src/lib/api/social', () => ({
  getLobbyInvite: vi.fn(async () => ({ status: 'in_lobby' })),
  getOnboarding: vi.fn(async () => ({ steps: [], current: null, doneCount: 0, chatNeed: 6,
    userMessages: 0, shareable: null, latestTaskId: null, resultConversationId: null })),
}))

beforeEach(() => vi.clearAllMocks())

describe('message-count gated requests used by social hooks', () => {
  it('does not request either resource while the message count is unknown', () => {
    expect(loadLobbyInviteAfterMessages(null)).toBeNull()
    expect(loadOnboardingAfterMessages(null)).toBeNull()
    expect(getLobbyInvite).not.toHaveBeenCalled()
    expect(getOnboarding).not.toHaveBeenCalled()
  })

  it.each([0, 8])('requests each resource once after messages load (count %i)', async count => {
    await loadLobbyInviteAfterMessages(count)
    await loadOnboardingAfterMessages(count)
    expect(getLobbyInvite).toHaveBeenCalledOnce()
    expect(getOnboarding).toHaveBeenCalledOnce()
  })
})
