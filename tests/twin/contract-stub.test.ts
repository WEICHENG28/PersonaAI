// C0：server/contracts/twin.ts 的 stub 行為（07C C0 第 2 點）。B 會用這些函式先開發 Agent 迴圈。
import { describe, expect, it } from 'vitest'
import {
  endConversation,
  getTranscript,
  guardText,
  markWaitingHuman,
  runTwinRounds,
  startConversation,
} from '../../server/contracts/twin'

const start = (aUserId = 'user-me', bUserId = 'seed-an') =>
  startConversation({ aUserId, bUserId, aController: 'twin', origin: 'auto', openingTopic: '登山' })

describe('twin contracts stub', () => {
  it('startConversation 每次回不同的假 ID', async () => {
    const first = await start()
    const second = await start()
    expect(first.conversationId).toMatch(/^conv-stub-/)
    expect(second.conversationId).not.toBe(first.conversationId)
  })

  it('runTwinRounds 回 { roundCount: 原值 + rounds, ended: false }', async () => {
    const { conversationId } = await start()
    expect(await runTwinRounds(conversationId, 4)).toEqual({ roundCount: 4, ended: false })
    expect(await runTwinRounds(conversationId, 4)).toEqual({ roundCount: 8, ended: false })
  })

  it('每一輪雙方各寫一則假訊息，getTranscript 依時間排序', async () => {
    const { conversationId } = await start('user-me', 'seed-an')
    await runTwinRounds(conversationId, 3)

    const transcript = await getTranscript(conversationId)
    expect(transcript).toHaveLength(6)
    expect(transcript.map((m) => m.sender_id)).toEqual(['user-me', 'seed-an', 'user-me', 'seed-an', 'user-me', 'seed-an'])
    for (const m of transcript) {
      expect(m).toMatchObject({ conversation_id: conversationId, is_ai: true })
      expect(m.content).not.toBe('')
    }
    const times = transcript.map((m) => m.created_at)
    expect([...times].sort()).toEqual(times)
    expect(new Set(transcript.map((m) => m.id)).size).toBe(6)
  })

  it('不同對話的紀錄互不影響', async () => {
    const one = await start()
    const two = await start()
    await runTwinRounds(one.conversationId, 2)
    expect(await getTranscript(two.conversationId)).toHaveLength(0)
  })

  it('沒有用 startConversation 建過的 ID 仍回固定假紀錄，conversation_id 換成傳入值', async () => {
    const transcript = await getTranscript('conv-from-b')
    expect(transcript.length).toBeGreaterThan(0)
    expect(transcript.every((m) => m.conversation_id === 'conv-from-b')).toBe(true)
  })

  it('rounds 不是正整數時丟錯', async () => {
    const { conversationId } = await start()
    await expect(runTwinRounds(conversationId, 0)).rejects.toThrow()
    await expect(runTwinRounds(conversationId, 1.5)).rejects.toThrow()
  })

  it('guardText 原樣回傳；endConversation、markWaitingHuman 可以呼叫', async () => {
    expect(await guardText('我住在山上很安静', 'seed-an')).toEqual({ ok: true, text: '我住在山上很安静', issues: [] })
    const { conversationId } = await start()
    await expect(endConversation(conversationId, 'done')).resolves.toBeUndefined()
    await expect(markWaitingHuman(conversationId)).resolves.toBeUndefined()
  })
})
