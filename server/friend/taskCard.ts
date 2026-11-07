import { createTaskFromText, TaskError, UsageLimitError } from '../contracts/social.js'
import { BlockedContentError } from '../lib/moderation.js'
import { getServiceClient } from '../lib/supabase.js'
import { writeLog } from '../lib/log.js'

const TASK_FAILED = '刚刚没帮你把任务建好，你再说一次想找什么样的人？'

/** 背景建卡；任務、日誌或失敗訊息寫入出錯都不影響已送出的聊天回覆。 */
export async function createTaskCard(userId: string, taskText: string): Promise<string | null> {
  try {
    const task = await createTaskFromText(userId, taskText)
    const { error } = await getServiceClient().from('friend_messages').insert({
      user_id: userId, role: 'friend', kind: 'task_card',
      content: task.restatement ?? taskText, meta: { taskId: task.id },
    })
    if (error) throw error
    return task.id
  } catch (error) {
    console.error('[friend] createTask failed', error)
    try {
      await writeLog({ user_id: userId, agent: 'friend', action: '交办任务失败', reason: String(error) })
    } catch (logError) {
      console.error('[friend] task failure log failed', logError)
    }
    const content = error instanceof TaskError || error instanceof UsageLimitError || error instanceof BlockedContentError
      ? error.message : TASK_FAILED
    try {
      const result = await getServiceClient().from('friend_messages').insert({
        user_id: userId, role: 'friend', kind: 'chat', content, meta: { task_failed: true },
      })
      if (result.error) throw result.error
    } catch (messageError) {
      console.error('[friend] task failure message failed', messageError)
    }
    return null
  }
}
