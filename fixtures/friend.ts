// A 線假資料（stub 用；07A A0.10）。僅 A 線可改。

import type { AgentProfile, ShareableProfile } from '@/lib/types'

export const shareableProfile: ShareableProfile = {
  intro: '喜歡看展的動漫迷',
  interests: ['動漫', '看展', '登山'],
  chat_style: '慢熱但真誠，喜歡先聽再說',
  looking_for: '能一起逛展、聊聊興趣的朋友',
}

export const agentProfile: AgentProfile = {
  big_five: {
    O: { score: 78, confidence: 0.6, evidence: '對新展覽與新話題展現好奇心（多於一次）' },
    C: { score: 55, confidence: 0.3, evidence: '提及計畫型安排，出現一次' },
    E: { score: 40, confidence: 0.5, evidence: '回應溫和、話題推進節奏偏慢（多次）' },
    A: { score: 72, confidence: 0.55, evidence: '回應他人分享時先表達關心（多於一次）' },
    N: { score: 45, confidence: 0.2, evidence: '資訊不足' },
  },
  values: ['真誠', '界線感'],
  style: {
    sentence_length: 'short',
    tone: '溫和、偶爾冷幽默',
    emoji_level: 1,
    formality: 'casual',
  },
}
