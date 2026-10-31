import type { Api, Candidate, Memory, ShareableProfile } from './types'
import { candidates, seedMemories, seedProfile } from '../../demo/fixtures'
import { answerLobbyQuestion } from '../../demo/lobbyHelper'

/**
 * MockApi：全部同步本地资料，零后端。
 * 画面经由 `api` 使用；未来换成 HttpApi（fetch + Supabase）即可。
 */
export const MockApi: Api = {
  async login(email, _password) {
    await delay(600)
    return { id: 'u-demo', email, nickname: '小望' }
  },

  async getMemories() {
    await delay(100)
    return seedMemories.map((m) => ({ ...m })) as Memory[]
  },

  async deleteMemory(id) {
    await delay(100)
    void id
  },

  async getProfile() {
    await delay(100)
    return { ...seedProfile } as ShareableProfile
  },

  async updateProfile(p) {
    await delay(300)
    return { ...seedProfile, ...p } as ShareableProfile
  },

  async getLobby() {
    await delay(200)
    return candidates.map((c) => ({ ...c })) as Candidate[]
  },

  async askLobbyHelper(q) {
    await delay(700)
    return answerLobbyQuestion(q, candidates, [])
  },
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}
