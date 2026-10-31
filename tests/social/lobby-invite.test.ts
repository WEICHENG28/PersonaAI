// 真人進大廳的邀請：聊夠了＋對外檔案夠完整才邀請；用戶按加入才確認檔案、開社交 Agent。
import { describe, expect, it } from 'vitest'
import { acceptLobbyInvite, getLobbyInvite, type LobbyInviteDeps, type LobbyInviteState } from '../../server/social/lobbyInvite'

const profile = { intro: '爱爬山的上班族', interests: ['登山', '摄影'], chat_style: '温和', looking_for: '周末一起爬山的人' }

function fake(state: Partial<LobbyInviteState>, extracted?: LobbyInviteState['shareable']) {
  const s: LobbyInviteState = { userMessages: 0, shareable: null, confirmed: false, socialAgentEnabled: false, ...state }
  const calls = { extract: 0, join: 0 }
  const deps: LobbyInviteDeps = {
    async load() {
      return { ...s }
    },
    async extractProfile() {
      calls.extract++
      if (extracted !== undefined) s.shareable = extracted
    },
    async join() {
      calls.join++
      s.confirmed = true
      s.socialAgentEnabled = true
    },
  }
  return { deps, calls }
}

describe('getLobbyInvite', () => {
  it('聊不夠：還不邀請，也不撷取', async () => {
    const { deps, calls } = fake({ userMessages: 3, shareable: profile })
    expect(await getLobbyInvite('u', deps)).toMatchObject({ status: 'not_yet', need: 8 })
    expect(calls.extract).toBe(0)
  })

  it('聊夠了且檔案完整：邀請並帶上對外檔案', async () => {
    const { deps } = fake({ userMessages: 8, shareable: profile })
    expect(await getLobbyInvite('u', deps)).toEqual({ status: 'invite', shareable: profile })
  })

  it('聊夠了但還沒有檔案：先補撷取一次', async () => {
    const { deps, calls } = fake({ userMessages: 9 }, profile)
    expect(await getLobbyInvite('u', deps)).toMatchObject({ status: 'invite' })
    expect(calls.extract).toBe(1)
  })

  it('檔案不完整（興趣少於 2 個）：不邀請', async () => {
    const { deps } = fake({ userMessages: 10, shareable: { ...profile, interests: ['登山'] } }, { ...profile, interests: ['登山'] })
    expect(await getLobbyInvite('u', deps)).toMatchObject({ status: 'not_yet' })
  })

  it('已經在大廳：不再邀請', async () => {
    const { deps } = fake({ userMessages: 20, shareable: profile, confirmed: true, socialAgentEnabled: true })
    expect(await getLobbyInvite('u', deps)).toEqual({ status: 'in_lobby' })
  })
})

describe('acceptLobbyInvite', () => {
  it('符合條件：加入（確認檔案＋開社交 Agent）', async () => {
    const { deps, calls } = fake({ userMessages: 8, shareable: profile })
    expect(await acceptLobbyInvite('u', deps)).toEqual({ status: 'in_lobby' })
    expect(calls.join).toBe(1)
  })

  it('不符合條件：不加入', async () => {
    const { deps, calls } = fake({ userMessages: 2, shareable: profile })
    expect(await acceptLobbyInvite('u', deps)).toMatchObject({ status: 'not_yet' })
    expect(calls.join).toBe(0)
  })
})
