// 確認卡可編輯（editTask）與頂欄「我的聊天」列表的純函式。
import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryTaskStore, setTaskStore } from '../../server/social/taskStore'
import { editTask, restateTask } from '../../server/social/task'
import { chatState, preview, sortChats, type ChatListItem, type ConversationRow } from '../../server/social/chats'
import { normalize, splitConditions } from '../../src/features/social/taskEdit'

async function newTask(status: 'pending_confirm' | 'running' = 'pending_confirm') {
  const store = createMemoryTaskStore()
  setTaskStore(store)
  return store.insert({
    user_id: 'me', kind: 'search', raw_instruction: '帮我找 3 个读书伙伴', restatement: '旧的', purpose: 'study', conditions: ['兴趣是读书'],
    target_count: 3, done_condition: { suitable_count: 2, max_chats: 6, deadline: null }, target_user_id: null, status,
  })
}

afterEach(() => setTaskStore(null))

describe('editTask', () => {
  it('待確認時可以改：人數、條件、目的、完成條件，並重寫複述', async () => {
    const task = await newTask()
    const next = await editTask('me', task.id, { purpose: 'sport', conditions: ['登山', '周末有空'], count: 5, suitable_count: 3, max_chats: 8 })
    expect(next).toMatchObject({ purpose: 'sport', conditions: ['登山', '周末有空'], target_count: 5, done_condition: { suitable_count: 3, max_chats: 8 } })
    expect(next.restatement).toBe('帮你找 5 位登山、周末有空的运动伙伴，找到 3 位合适就停，最多代聊 8 场，可以吗？')
  })

  it('數字夾在合理範圍：人數 1–10、合適數不超過人數、代聊場數不少於合適數', async () => {
    const task = await newTask()
    const next = await editTask('me', task.id, { purpose: 'friend', conditions: [], count: 99, suitable_count: 50, max_chats: 1 })
    expect(next).toMatchObject({ target_count: 10, done_condition: { suitable_count: 10, max_chats: 10 } })
  })

  it('已經開始的任務不能改；別人的任務找不到', async () => {
    const running = await newTask('running')
    await expect(editTask('me', running.id, { purpose: 'friend', conditions: [], count: 2, suitable_count: 1, max_chats: 2 })).rejects.toThrow('不能再修改')
    const mine = await newTask()
    await expect(editTask('someone', mine.id, { purpose: 'friend', conditions: [], count: 2, suitable_count: 1, max_chats: 2 })).rejects.toThrow('找不到')
  })

  it('沒有條件時複述不帶條件', () => {
    expect(restateTask({ purpose: 'friend', conditions: [], count: 2, suitable_count: 1, max_chats: 4 })).toBe('帮你找 2 位交友，找到 1 位合适就停，最多代聊 4 场，可以吗？')
  })
})

describe('確認卡前端：normalize／splitConditions', () => {
  it('人數改小時，合適數與代聊場數跟著調', () => {
    expect(normalize({ purpose: 'friend', conditions: [], count: 2, suitable_count: 5, max_chats: 1 })).toMatchObject({ count: 2, suitable_count: 2, max_chats: 2 })
  })
  it('條件用頓號、逗號、空白分開都可以', () => {
    expect(splitConditions('登山、 摄影,看展，  ')).toEqual(['登山', '摄影', '看展'])
  })
})

describe('我的聊天', () => {
  const row = (patch: Partial<ConversationRow>): ConversationRow => ({
    id: 'c', side_a: 'me', side_b: 'you', side_a_controller: 'twin', side_b_controller: 'twin', status: 'active', created_at: '2026-10-31T00:00:00Z', ...patch,
  })

  it('狀態：等你接手／你们在聊／分身代聊中（看我這一邊）', () => {
    expect(chatState(row({ status: 'waiting_human' }), 'me')).toBe('waiting_you')
    expect(chatState(row({ side_a_controller: 'human' }), 'me')).toBe('chatting')
    expect(chatState(row({ side_a_controller: 'human' }), 'you')).toBe('twin_chatting')
  })

  it('要我處理的排前面，其餘依時間新到舊；預覽太長截斷', () => {
    const item = (id: string, state: ChatListItem['state'], lastAt: string): ChatListItem => ({ conversationId: id, otherName: id, otherIsSeed: false, state, lastMessage: null, lastAt })
    const sorted = sortChats([item('old', 'twin_chatting', '2026-10-30'), item('new', 'twin_chatting', '2026-10-31'), item('wait', 'waiting_you', '2026-10-01')])
    expect(sorted.map((i) => i.conversationId)).toEqual(['wait', 'new', 'old'])
    expect(preview('字'.repeat(50))).toHaveLength(41)
  })
})
