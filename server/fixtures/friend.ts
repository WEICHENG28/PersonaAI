// A 線 stub 假資料（server/contracts/friend.ts 用）。A 換成真實作後可刪。
import type { AgentProfile, ShareableProfile, StyleProfile } from '../../shared/types'

export const fakeShareable: ShareableProfile = {
  intro: '慢热的登山爱好者',
  interests: ['登山', '看展', '动漫'],
  chat_style: '句子不长，先回应情绪再追问',
  looking_for: '可以一起爬山、聊得来的朋友',
}

export const fakeStyle: StyleProfile = {
  sentence_length: 'short',
  tone: '温和、带点冷幽默',
  emoji_level: 1,
  formality: 'casual',
}

const trait = (score: number) => ({ score, confidence: 0.4, evidence: 'stub' })

export const fakeAgentProfile: AgentProfile = {
  big_five: { O: trait(70), C: trait(55), E: trait(35), A: trait(75), N: trait(45) },
  values: ['真诚', '尊重节奏'],
  style: fakeStyle,
}
