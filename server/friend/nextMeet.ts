/**
 * A5：模擬下次見面。擁有者：A。
 * 規格：docs/07A_AI朋友線.md「A5」一節。
 */
import { getServiceClient } from '../lib/supabase.js'
import { llmJson } from '../lib/llm/index.js'
import { writeLog } from '../lib/log.js'
import { getLifeUpdate } from './persona.js'
import { listMemories } from './memory.js'
import { renderReportSystem, reportReplySchema } from '../prompts/08_report.js'
import type { TaskReport } from '../../shared/types.js'

export class NextMeetError extends Error {
  constructor(message = '模拟下次见面失败') {
    super(message)
    this.name = 'NextMeetError'
  }
}

/**
 * POST /api/friend/next-meet
 * 1. story_stage + 1，更新 life_state
 * 2. 存入近況開場（kind = 'life_update'）
 * 3. 若有記憶，挑最新的一筆自然問起（kind = 'chat'）
 * 4. 若有未讀的 friend_report 通知：逐筆呼叫 Prompt 8，存成 kind = 'report'，設已讀
 * 5. 寫日誌
 */
export async function nextMeet(userId: string): Promise<void> {
  const db = getServiceClient()

  // 1. 取當前 story_stage，+1 並更新 life_state
  const { data: friend, error: fErr } = await db
    .from('ai_friends')
    .select('story_stage, shared_event_ids')
    .eq('user_id', userId)
    .single()
  if (fErr || !friend) throw new NextMeetError(`查询朋友状态失败：${fErr?.message ?? 'no row'}`)

  const newStage = (friend.story_stage as number) + 1
  const lifeUpdate = getLifeUpdate(newStage)

  const { error: uErr } = await db
    .from('ai_friends')
    .update({
      story_stage: newStage,
      life_state: { mood: lifeUpdate.mood, doing: lifeUpdate.doing },
    })
    .eq('user_id', userId)
  if (uErr) throw new NextMeetError(`更新阶段失败：${uErr.message}`)

  // 2. 存入近況開場（kind = 'life_update'）
  if (lifeUpdate.opener) {
    const { error: mErr } = await db.from('friend_messages').insert({
      user_id: userId,
      role: 'friend',
      kind: 'life_update',
      content: lifeUpdate.opener,
      meta: {},
    })
    if (mErr) throw new NextMeetError(`写入近况失败：${mErr.message}`)
  }

  // 3. 若有記憶，挑最新的一筆問起（簡化：直接用最新記憶的 content）
  const memories = await listMemories(userId)
  if (memories.length > 0) {
    const latest = memories[0]!
    // 這裡應該呼叫 Prompt 1 產生自然問話，為簡化先用模板
    const recallText = `对了，${latest.content.replace(/^用户/, '你')}，后来怎么样了？`
    const { error: rErr } = await db.from('friend_messages').insert({
      user_id: userId,
      role: 'friend',
      kind: 'chat',
      content: recallText,
      meta: { recall_memory_id: latest.id },
    })
    if (rErr) console.error('[nextMeet] 写入记忆问话失败', rErr.message)
  }

  // 4. 若有未讀的 friend_report 通知：逐筆呼叫 Prompt 8
  const delivered = await deliverPendingReports(userId)

  // 5. 寫日誌
  await writeLog({
    user_id: userId,
    agent: 'friend',
    action: '模拟下次见面',
    reason: `stage ${friend.story_stage} → ${newStage}，处理了 ${delivered} 个回报`,
  })
}

/**
 * 把未讀的任務回報（friend_report）由阿澈用朋友口吻說出來，存成 kind = 'report' 並設已讀。
 * AI 朋友頁打開時也會呼叫（不必等「模擬下次見面」），鈴鐺的「阿澈有事想跟你说」才會消失。
 * 先搶到這筆（read_at 由 null 改成現在）才產生，兩個分頁同時打開也不會說兩次；產生失敗就還原成未讀。
 * 回傳這次說了幾筆。
 */
export async function deliverPendingReports(userId: string): Promise<number> {
  const db = getServiceClient()
  const { data: reports, error } = await db
    .from('notifications')
    .select('id, payload')
    .eq('user_id', userId)
    .eq('type', 'friend_report')
    .is('read_at', null)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[reports] 读取通知失败', error.message)
    return 0
  }

  let delivered = 0
  for (const notif of reports ?? []) {
    const { data: claimed } = await db
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notif.id)
      .is('read_at', null)
      .select('id')
    if (!claimed || claimed.length === 0) continue
    try {
      const report = notif.payload as TaskReport
      const out = await llmJson({
        role: 'chat',
        system: renderReportSystem(JSON.stringify(report, null, 2)),
        messages: [{ role: 'user', content: '请用朋友口吻回报任务结果' }],
        temperature: 0.7,
        schema: reportReplySchema,
      })
      await db.from('friend_messages').insert({
        user_id: userId,
        role: 'friend',
        kind: 'report',
        content: out.reply,
        meta: { task_id: report.task_id },
      })
      delivered++
    } catch (err) {
      console.error('[reports] 处理 report 失败', err)
      await db.from('notifications').update({ read_at: null }).eq('id', notif.id)
    }
  }
  return delivered
}
