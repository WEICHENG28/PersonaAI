// C 線 stub 假資料（server/contracts/twin.ts 用）。
import type { ChatMessage } from '../../shared/types'

export const fakeTranscript: ChatMessage[] = [
  { id: 'm1', conversation_id: 'conv-stub-1', sender_id: 'me', is_ai: true, content: '最近有去爬山吗？', created_at: '2026-10-30T10:00:00Z' },
  { id: 'm2', conversation_id: 'conv-stub-1', sender_id: 'seed-lin', is_ai: true, content: '上周刚去了一趟，风景超好。你呢？', created_at: '2026-10-30T10:00:05Z' },
]
