// B1｜一句話任務解析與任務狀態（docs/07B 的 B1、02 F12）。擁有者：B。
import type { AgentTask, ParsedTask, Purpose, TaskStatus } from '../../shared/types.js'
import { llmJson } from '../lib/llm/index.js'
import { writeLog } from '../lib/log.js'
import { TASK_PROMPT_SYSTEM, parsedTaskSchema, taskPromptUser, type RawParsedTask } from '../prompts/14_task.js'
import { getTaskStore } from './taskStore.js'
import { notReadyMessage } from './readiness.js'

const MAX_COUNT = 10
const DEFAULT_COUNT = 3

export const PURPOSE_LABEL: Record<Purpose, string> = {
  friend: '交友',
  study: '读书伙伴',
  sport: '运动伙伴',
  hobby: '兴趣同好',
}

/** 給用戶看的錯誤（路由會原樣回傳 error 文字）。 */
export class TaskError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 = 400,
  ) {
    super(message)
    this.name = 'TaskError'
  }
}

/** 模型漏給或超出範圍的數字照 Prompt 14 的規則補正，避免完全依賴模型。 */
export function normalizeParsed(raw: RawParsedTask): ParsedTask {
  const count = clamp(raw.count ?? DEFAULT_COUNT, 1, MAX_COUNT)
  return {
    purpose: raw.purpose,
    conditions: raw.conditions.map((c) => c.trim()).filter(Boolean),
    count,
    done: {
      suitable_count: clamp(raw.done.suitable_count ?? Math.min(count, 2), 1, count),
      max_chats: Math.max(raw.done.max_chats ?? count * 2, 1),
      deadline: raw.done.deadline ?? null,
    },
    restatement: raw.restatement.trim(),
  }
}

export async function parseTask(text: string): Promise<ParsedTask> {
  const raw = await llmJson({
    role: 'reason',
    system: TASK_PROMPT_SYSTEM,
    messages: [{ role: 'user', content: taskPromptUser(text) }],
    schema: parsedTaskSchema,
    temperature: 0,
  })
  return normalizeParsed(raw)
}

export async function createTaskFromText(userId: string, text: string): Promise<AgentTask> {
  const instruction = text.trim()
  if (!instruction) throw new TaskError('请先说说想找什么样的人')
  const parsed = await parseTask(instruction)
  const task = await getTaskStore().insert({
    user_id: userId,
    kind: 'search',
    raw_instruction: instruction,
    restatement: parsed.restatement,
    purpose: parsed.purpose,
    conditions: parsed.conditions,
    target_count: parsed.count,
    done_condition: parsed.done,
    target_user_id: null,
    status: 'pending_confirm',
  })
  await writeLog({
    user_id: userId,
    agent: 'social',
    action: `收到任务：${parsed.restatement}`,
    reason: `目的：${PURPOSE_LABEL[parsed.purpose]}；条件：${parsed.conditions.join('、') || '无'}`,
    task_id: task.id,
  })
  return task
}

/**
 * 大廳選「分身去聊」或歷史頁「讓分身再試一次」：直接建立 running 的單人任務（只聊這一位）。
 * 和確認任務一樣，要先確認對外檔案、開啟社交 Agent。
 */
export async function createSingleTargetTask(userId: string, targetUserId: string, targetName = '对方'): Promise<AgentTask> {
  const notReady = notReadyMessage(await getTaskStore().readiness(userId), '，分身才能替你去聊')
  if (notReady) throw new TaskError(notReady, 403)
  const restatement = `让分身和${targetName}聊一聊`
  const task = await getTaskStore().insert({
    user_id: userId,
    kind: 'single',
    raw_instruction: null,
    restatement,
    purpose: 'friend',
    conditions: [],
    target_count: 1,
    done_condition: { suitable_count: 1, max_chats: 1, deadline: null },
    target_user_id: targetUserId,
    status: 'running',
  })
  await writeLog({ user_id: userId, agent: 'social', action: `收到任务：${restatement}`, reason: '你指定了这位', task_id: task.id })
  return task
}

/** 只有任務的主人能看、能改。 */
export async function getOwnTask(userId: string, taskId: string): Promise<AgentTask> {
  const task = await getTaskStore().get(taskId)
  if (!task || task.user_id !== userId) throw new TaskError('找不到这个任务', 404)
  return task
}

/** 確認卡上用戶改的內容。 */
export interface TaskEdit {
  purpose: Purpose
  conditions: string[]
  count: number
  suitable_count: number
  max_chats: number
}

export const MAX_CHATS_LIMIT = 30

/** 改完重寫一句複述，和 Prompt 14 的說法一致（不再呼叫 LLM）。 */
export function restateTask(e: TaskEdit): string {
  const cond = e.conditions.length ? `${e.conditions.join('、')}的` : ''
  return `帮你找 ${e.count} 位${cond}${PURPOSE_LABEL[e.purpose]}，找到 ${e.suitable_count} 位合适就停，最多代聊 ${e.max_chats} 场，可以吗？`
}

/** 只有還沒開始（待確認）的任務能改；數字照規則夾在合理範圍內。 */
export async function editTask(userId: string, taskId: string, edit: TaskEdit): Promise<AgentTask> {
  const task = await getOwnTask(userId, taskId)
  if (task.status !== 'pending_confirm') throw new TaskError('任务已经开始，不能再修改')
  const count = clamp(edit.count, 1, MAX_COUNT)
  const suitable = clamp(edit.suitable_count, 1, count)
  const maxChats = clamp(edit.max_chats, suitable, MAX_CHATS_LIMIT)
  const conditions = edit.conditions.map((c) => c.trim()).filter(Boolean).slice(0, 8)
  const clean: TaskEdit = { purpose: edit.purpose, conditions, count, suitable_count: suitable, max_chats: maxChats }
  const updated = await getTaskStore().updateFields(taskId, {
    purpose: clean.purpose,
    conditions,
    target_count: count,
    done_condition: { ...task.done_condition, suitable_count: suitable, max_chats: maxChats },
    restatement: restateTask(clean),
  })
  await writeLog({ user_id: userId, agent: 'social', action: `修改任务：${updated.restatement ?? ''}`, reason: '用户在确认卡上修改', task_id: taskId })
  return updated
}

const TRANSITIONS: Record<'confirm' | 'pause' | 'resume' | 'cancel', { from: TaskStatus[]; to: TaskStatus; verb: string }> = {
  confirm: { from: ['pending_confirm'], to: 'running', verb: '开始' },
  pause: { from: ['running'], to: 'paused', verb: '暂停' },
  resume: { from: ['paused'], to: 'running', verb: '继续' },
  cancel: { from: ['pending_confirm', 'running', 'paused'], to: 'cancelled', verb: '取消' },
}

export type TaskAction = keyof typeof TRANSITIONS

export async function changeTaskStatus(userId: string, taskId: string, action: TaskAction): Promise<AgentTask> {
  const task = await getOwnTask(userId, taskId)
  const rule = TRANSITIONS[action]
  if (!rule.from.includes(task.status)) throw new TaskError(`这个任务目前不能${rule.verb}`)

  if (rule.to === 'running') {
    const notReady = notReadyMessage(await getTaskStore().readiness(userId))
    if (notReady) throw new TaskError(notReady, 403)
  }

  const updated = await getTaskStore().setStatus(taskId, rule.to)
  await writeLog({
    user_id: userId,
    agent: 'social',
    action: `任务${rule.verb}：${task.restatement ?? task.raw_instruction ?? ''}`,
    reason: '用户操作',
    task_id: taskId,
  })
  return updated
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(n), min), max)
}
