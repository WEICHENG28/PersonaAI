// C3 代聊函式的記憶體版（原 C0 stub，07C C0 第 2 點）。擁有者：C。
// 沒設定 Supabase 時（B 的記憶體模式、測試）server/contracts/twin.ts 改用這份：
// 回傳 server/fixtures 假資料，對話狀態只存在記憶體（server 重啟就清空）。
import type { ChatMessage, StartConversationInput } from '../../shared/types'
import { FAKE_MESSAGE_GAP_MS, FAKE_START_TIME, fakeRoundLines, fakeTranscript } from '../fixtures/twin'
import type { ConversationApi } from './conversation'

interface StubConversation {
  aUserId: string
  bUserId: string
  roundCount: number
  messages: readonly ChatMessage[]
}

const conversations = new Map<string, StubConversation>()
let nextId = 1

async function startConversation(input: StartConversationInput): Promise<{ conversationId: string }> {
  const conversationId = `conv-stub-${nextId++}`
  conversations.set(conversationId, { aUserId: input.aUserId, bUserId: input.bUserId, roundCount: 0, messages: [] })
  return { conversationId }
}

async function runTwinRounds(conversationId: string, rounds: number): Promise<{ roundCount: number; ended: boolean }> {
  if (!Number.isInteger(rounds) || rounds < 1) throw new Error(`rounds 必須是正整數，收到 ${rounds}`)
  const conv = conversations.get(conversationId) ?? { aUserId: 'seed-an', bUserId: 'seed-zhe', roundCount: 0, messages: [] }
  const added = Array.from({ length: rounds }, (_, i) => fakeRound(conversationId, conv, conv.roundCount + i)).flat()
  const next: StubConversation = { ...conv, roundCount: conv.roundCount + rounds, messages: [...conv.messages, ...added] }
  conversations.set(conversationId, next)
  return { roundCount: next.roundCount, ended: false }
}

async function getTranscript(conversationId: string): Promise<ChatMessage[]> {
  const conv = conversations.get(conversationId)
  if (!conv) return fakeTranscript.map((m) => ({ ...m, conversation_id: conversationId }))
  return [...conv.messages].sort((x, y) => x.created_at.localeCompare(y.created_at))
}

/** 第 roundIndex 輪（從 0 起算）的兩則假訊息：a 方先、b 方後。 */
function fakeRound(conversationId: string, conv: StubConversation, roundIndex: number): ChatMessage[] {
  const lines = fakeRoundLines[roundIndex % fakeRoundLines.length]!
  const speakers = [
    { sender: conv.aUserId, content: lines.a },
    { sender: conv.bUserId, content: lines.b },
  ]
  return speakers.map(({ sender, content }, j) => {
    const seq = roundIndex * 2 + j
    return {
      id: `${conversationId}-m${seq + 1}`,
      conversation_id: conversationId,
      sender_id: sender,
      is_ai: true,
      content,
      created_at: new Date(Date.parse(FAKE_START_TIME) + seq * FAKE_MESSAGE_GAP_MS).toISOString(),
    }
  })
}

export const memoryConversationApi: ConversationApi = {
  startConversation,
  runTwinRounds,
  getTranscript,
  endConversation: async () => {},
  markWaitingHuman: async () => {},
}
