// B 線 stub 假資料（server/contracts/social.ts 用）。
import type { AgentTask, LobbyCandidate } from '../../shared/types.js'

export function fakeTask(userId: string, overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task-stub-1',
    user_id: userId,
    kind: 'search',
    raw_instruction: '帮我找 3 个喜欢登山的人聊聊',
    restatement: '帮你找喜欢登山的运动伙伴，找到 2 位双向合适就停',
    purpose: 'sport',
    conditions: ['喜欢登山'],
    target_count: 3,
    done_condition: { suitable_count: 2 },
    target_user_id: null,
    status: 'pending_confirm',
    progress: { screened: 0, chats: 0, suitable: 0 },
    active_conversation_id: null,
    attempted_user_ids: [],
    ...overrides,
  }
}

export const fakeCandidates: LobbyCandidate[] = [
  {
    user_id: 'seed-lin',
    display_name: '林小山',
    shareable: {
      intro: '周末都在山上',
      interests: ['登山', '摄影'],
      chat_style: '慢热、回复认真',
      looking_for: '一起爬山的伙伴',
    },
    similarity: 0.82,
  },
  {
    user_id: 'seed-chen',
    display_name: '陈岭',
    shareable: {
      intro: '精力旺盛的越野跑者',
      interests: ['越野跑', '登山'],
      chat_style: '节奏快、爱开玩笑',
      looking_for: '运动伙伴',
    },
    similarity: 0.69,
  },
]
