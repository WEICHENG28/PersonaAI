import { describe, expect, it } from 'vitest'
import { createTask, describeDone, updateTask } from '../../src/lib/api/social'

describe('前端 social API（mock 模式）', () => {
  it('一句話建立任務並可以確認', async () => {
    const task = await createTask('帮我找 3 个喜欢登山的人聊聊')
    expect(task).toMatchObject({ purpose: 'sport', conditions: ['喜欢登山'], target_count: 3, status: 'pending_confirm' })
    expect(describeDone(task)).toBe('找到 2 位合适就停，最多代聊 6 场')
    expect((await updateTask(task.id, 'confirm')).status).toBe('running')
  })
})
