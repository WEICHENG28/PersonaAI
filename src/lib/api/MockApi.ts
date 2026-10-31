import type { Api, Candidate, Memory, ShareableProfile } from './types'
import { candidates, seedMemories, seedProfile } from '../../demo/fixtures'

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
    if (q.includes('登山') || q.includes('爬山')) {
      return '林小山和陈岭都常登山。林小山偏安静、节奏慢，跟你「慢热」的偏好更合；陈岭精力旺盛，可能聊得快一些。'
    }
    if (q.includes('合') || q.includes('适合')) {
      return '以你的档案看，林小山跟你最聊得来：共同兴趣是登山与看展，聊天风格也偏慢热。可能的摩擦点是对方周末时间比较满。'
    }
    return '我帮你比了比：林小山跟你的共同兴趣最多，周予安其次，陈岭也不错。想看谁的卡片？'
  },
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}
