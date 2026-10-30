// B 線假資料（stub 用）。B 線可改。

import type { AgentTask, LobbyCandidate } from '@/lib/types'

export const agentTask: AgentTask = {
  id: '00000000-0000-4000-8000-00000000000b',
  user_id: '00000000-0000-4000-8000-00000000000a',
  kind: 'search',
  raw_instruction: '幫我找 3 個喜歡登山的人聊聊',
  restatement: '目的：運動夥伴；條件：喜歡登山；找 3 位，2 位雙向合適就停。',
  purpose: 'sport',
  conditions: ['喜歡登山'],
  target_count: 3,
  done_condition: { suitable_count: 2 },
  target_user_id: null,
  status: 'pending_confirm',
  progress: { screened: 0, chats: 0, suitable: 0 },
  active_conversation_id: null,
  attempted_user_ids: [],
}

export const lobbyCandidates: LobbyCandidate[] = [
  {
    user_id: '00000000-0000-4000-8000-000000000001',
    display_name: '小山',
    shareable: {
      intro: '週末爬山的風景控',
      interests: ['登山', '攝影'],
      chat_style: '節奏慢但會認真回',
      looking_for: '一起走郊山的夥伴',
    },
    similarity: 0.87,
  },
  {
    user_id: '00000000-0000-4000-8000-000000000002',
    display_name: '阿嵐',
    shareable: {
      intro: '喜歡山的安靜人也安靜',
      interests: ['登山', '咖啡'],
      chat_style: '短句、少 emoji',
      looking_for: '不需要一直聊的運動夥伴',
    },
    similarity: 0.81,
  },
]
