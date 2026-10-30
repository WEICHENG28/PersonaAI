// C 線假資料（stub 用）。C 線可改。

import type { ChatMessage } from '@/lib/types'

export const chatMessages: ChatMessage[] = [
  {
    id: '00000000-0000-4000-8000-00000000m001',
    conversation_id: '00000000-0000-4000-8000-0000000000c1',
    sender_id: '00000000-0000-4000-8000-000000000002',
    is_ai: true,
    content: '嗨，最近有去爬山嗎？',
    created_at: '2026-10-30T02:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-00000000m002',
    conversation_id: '00000000-0000-4000-8000-0000000000c1',
    sender_id: '00000000-0000-4000-8000-000000000001',
    is_ai: true,
    content: '上週剛走完象山，風景不錯。你呢？',
    created_at: '2026-10-30T02:00:05.000Z',
  },
]
