// C 線 stub 假資料（server/contracts/twin.ts 用）。C3 換成真實作後可刪。
// sender_id 用 server/fixtures/seed-users.ts 的 key（seed-an＝小安、seed-zhe＝阿哲）。
import type { ChatMessage } from '../../shared/types'

/** 沒有用 startConversation 建過的對話 ID，getTranscript 回這份。 */
export const fakeTranscript: ChatMessage[] = [
  { id: 'm1', conversation_id: 'conv-stub-1', sender_id: 'seed-an', is_ai: true, content: '最近有去爬山吗？', created_at: '2026-10-30T10:00:00Z' },
  { id: 'm2', conversation_id: 'conv-stub-1', sender_id: 'seed-zhe', is_ai: true, content: '上周刚去了一趟，风景超好！你呢？😆', created_at: '2026-10-30T10:00:05Z' },
]

/** runTwinRounds stub 每輪輪流取一組：a 方說一句、b 方回一句。 */
export const fakeRoundLines: readonly { a: string; b: string }[] = [
  { a: '最近有去爬山吗？', b: '上周刚去了一趟，风景超好！你呢？' },
  { a: '我也去了，拍了不少照片。', b: '好想看！你一般走什么难度的路线？' },
  { a: '偏轻松的，喜欢慢慢走。', b: '我最近在练越野跑，节奏比较快哈哈' },
  { a: '听起来很厉害。你怎么开始跑的？', b: '朋友拉我去跑了一次就停不下来了，下次一起爬山呀' },
]

export const FAKE_START_TIME = '2026-10-30T10:00:00Z'
export const FAKE_MESSAGE_GAP_MS = 5000
