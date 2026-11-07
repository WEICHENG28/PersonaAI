import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ create: vi.fn(), insert: vi.fn(), from: vi.fn(), log: vi.fn() }))
vi.mock('../../server/contracts/social.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../server/contracts/social.js')>(), createTaskFromText: mock.create,
}))
vi.mock('../../server/lib/supabase.js', () => ({
  getServiceClient: () => ({ from: mock.from }),
}))
vi.mock('../../server/lib/log.js', () => ({ writeLog: mock.log }))
vi.mock('../../server/lib/llm/index.js', () => ({ llmJson: vi.fn(), llmText: vi.fn(), embed: vi.fn() }))

import { TaskError } from '../../server/social/task.js'
import { UsageLimitError } from '../../server/social/usage.js'
import { BlockedContentError } from '../../server/lib/moderation.js'
import { createTaskCard } from '../../server/friend/taskCard.js'

const fallback = '刚刚没帮你把任务建好，你再说一次想找什么样的人？'
beforeEach(() => {
  mock.create.mockReset().mockResolvedValue({ id: 'task-1', restatement: '找登山伙伴' })
  mock.insert.mockReset().mockResolvedValue({ error: null })
  mock.from.mockReset().mockReturnValue({ insert: mock.insert })
  mock.log.mockReset().mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('createTaskCard', () => {
  it('成功建任务并插入 task_card 后回传 taskId', async () => {
    expect(await createTaskCard('u1', '帮我找人')).toBe('task-1')
    expect(mock.create).toHaveBeenCalledWith('u1', '帮我找人')
    expect(mock.from).toHaveBeenCalledWith('friend_messages')
    expect(mock.insert).toHaveBeenCalledWith({ user_id: 'u1', role: 'friend', kind: 'task_card', content: '找登山伙伴', meta: { taskId: 'task-1' } })
  })

  it('一般错误不泄漏底层 message，写日志和固定失败讯息后回 null', async () => {
    mock.create.mockRejectedValue(new Error('internal model error'))
    expect(await createTaskCard('u1', '帮我找人')).toBeNull()
    expect(mock.log).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u1', agent: 'friend', action: '交办任务失败' }))
    expect(mock.insert).toHaveBeenCalledWith({ user_id: 'u1', role: 'friend', kind: 'chat', content: fallback, meta: { task_failed: true } })
  })

  it.each([
    new TaskError('先确认你的对外档案'),
    new UsageLimitError('今天交办的找人任务已经到上限了，明天再来吧'),
    new BlockedContentError('blocked'),
  ])('已确认给用户看的错误沿用 message：$name', async (error) => {
    mock.create.mockRejectedValue(error)
    expect(await createTaskCard('u1', '帮我找人')).toBeNull()
    expect(mock.insert).toHaveBeenCalledWith(expect.objectContaining({ content: error.message, meta: { task_failed: true } }))
  })

  it('只伪造错误名称仍使用通用文案', async () => {
    mock.create.mockRejectedValue(Object.assign(new Error('internal'), { name: 'TaskError' }))
    expect(await createTaskCard('u1', '帮我找人')).toBeNull()
    expect(mock.insert).toHaveBeenCalledWith(expect.objectContaining({ content: fallback }))
  })

  it('卡片插入失败也转成失败讯息，不 throw', async () => {
    mock.insert.mockResolvedValueOnce({ error: { message: 'db offline' } })
    expect(await createTaskCard('u1', '帮我找人')).toBeNull()
    expect(mock.insert).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'chat', content: fallback, meta: { task_failed: true } }))
  })

  it.each([false, true])('日志和失败讯息再次失败只 console.error，不 throw（reject=%s）', async (reject) => {
    mock.create.mockRejectedValue(new Error('failed'))
    mock.log.mockRejectedValue(new Error('log failed'))
    if (reject) mock.insert.mockRejectedValue(new Error('insert failed'))
    else mock.insert.mockResolvedValue({ error: { message: 'insert failed' } })
    await expect(createTaskCard('u1', '帮我找人')).resolves.toBeNull()
    expect(mock.insert).toHaveBeenCalledWith(expect.objectContaining({ meta: { task_failed: true } }))
    expect(console.error).toHaveBeenCalled()
  })
})
