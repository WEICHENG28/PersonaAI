// B1｜一句話任務解析與任務狀態（docs/07B 的 B1、02 F12）。擁有者：B。
import type { AgentTask, ParsedTask, Purpose, TaskStatus } from '../../shared/types'
import { llmJson } from '../lib/llm'
import { writeLog } from '../lib/log'
import { TASK_PROMPT_SYSTEM, parsedTaskSchema, taskPromptUser, type RawParsedTask } from '../prompts/14_task'
import { getTaskStore } from './taskStore'

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

/** 只有任務的主人能看、能改。 */
export async function getOwnTask(userId: string, taskId: string): Promise<AgentTask> {
  const task = await getTaskStore().get(taskId)
  if (!task || task.user_id !== userId) throw new TaskError('找不到这个任务', 404)
  return task
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
    const ready = await getTaskStore().readiness(userId)
    if (!ready.socialAgentEnabled || !ready.shareableConfirmed) {
      throw new TaskError('先到「我的档案」确认对外档案，并在设置开启社交 Agent', 403)
    }
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
