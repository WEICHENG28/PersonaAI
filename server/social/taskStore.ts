// agent_tasks 的讀寫。有 Supabase 就寫資料庫，沒有就用記憶體（本機開發、測試）。
import type { AgentTask, DoneCondition, Purpose, TaskStatus } from '../../shared/types.js'
import { getAdminDb } from './db.js'

export interface NewTask {
  user_id: string
  kind: AgentTask['kind']
  raw_instruction: string | null
  restatement: string | null
  purpose: Purpose
  conditions: string[]
  target_count: number
  done_condition: DoneCondition
  target_user_id: string | null
  status: TaskStatus
}

/** 開始執行前要符合的條件（02 F4、07B B1）。 */
export interface UserReadiness {
  socialAgentEnabled: boolean
  shareableConfirmed: boolean
}

export interface TaskStore {
  insert(task: NewTask): Promise<AgentTask>
  get(id: string): Promise<AgentTask | null>
  setStatus(id: string, status: TaskStatus): Promise<AgentTask>
  /** 這位用戶最近的任務，新的在前。 */
  listByUser(userId: string, limit: number): Promise<AgentTask[]>
  readiness(userId: string): Promise<UserReadiness>
}

let override: TaskStore | null = null

/** 測試用：傳 null 還原。 */
export function setTaskStore(store: TaskStore | null): void {
  override = store
}

let memory: TaskStore | null = null

/** 記憶體模式下，任務 API 和社交 Agent 迴圈（agentStore）共用同一份任務。 */
export const sharedMemoryTasks = new Map<string, AgentTask>()

export function getTaskStore(): TaskStore {
  if (override) return override
  const db = getAdminDb()
  if (db) return supabaseStore(db)
  memory ??= createMemoryTaskStore(undefined, sharedMemoryTasks)
  return memory
}

export function createMemoryTaskStore(
  readiness: UserReadiness = { socialAgentEnabled: true, shareableConfirmed: true },
  tasks: Map<string, AgentTask> = new Map(),
): TaskStore {
  let seq = 0
  return {
    async insert(task) {
      const row: AgentTask = {
        ...task,
        id: `task-${++seq}`,
        progress: { screened: 0, chats: 0, suitable: 0 },
        active_conversation_id: null,
        attempted_user_ids: [],
      }
      tasks.set(row.id, row)
      return { ...row }
    },
    async get(id) {
      const row = tasks.get(id)
      return row ? { ...row } : null
    },
    async setStatus(id, status) {
      const row = tasks.get(id)
      if (!row) throw new Error(`task ${id} not found`)
      const next = { ...row, status }
      tasks.set(id, next)
      return { ...next }
    },
    async listByUser(userId, limit) {
      return [...tasks.values()].filter((t) => t.user_id === userId).reverse().slice(0, limit).map((t) => ({ ...t }))
    },
    async readiness() {
      return { ...readiness }
    },
  }
}

type Db = NonNullable<ReturnType<typeof getAdminDb>>

const TASK_COLUMNS =
  'id,user_id,kind,raw_instruction,restatement,purpose,conditions,target_count,done_condition,target_user_id,status,progress,active_conversation_id,attempted_user_ids'

function supabaseStore(db: Db): TaskStore {
  return {
    async insert(task) {
      const { data, error } = await db.from('agent_tasks').insert(task).select(TASK_COLUMNS).single()
      if (error) throw error
      return data as AgentTask
    },
    async get(id) {
      const { data, error } = await db.from('agent_tasks').select(TASK_COLUMNS).eq('id', id).maybeSingle()
      if (error) throw error
      return (data as AgentTask | null) ?? null
    },
    async setStatus(id, status) {
      const { data, error } = await db
        .from('agent_tasks')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select(TASK_COLUMNS)
        .single()
      if (error) throw error
      return data as AgentTask
    },
    async listByUser(userId, limit) {
      const { data, error } = await db.from('agent_tasks').select(TASK_COLUMNS).eq('user_id', userId).order('created_at', { ascending: false }).limit(limit)
      if (error) throw error
      return (data ?? []) as unknown as AgentTask[]
    },
    async readiness(userId) {
      const [user, profile] = await Promise.all([
        db.from('users').select('social_agent_enabled').eq('id', userId).maybeSingle(),
        db.from('user_profiles').select('shareable_confirmed').eq('user_id', userId).maybeSingle(),
      ])
      if (user.error) throw user.error
      if (profile.error) throw profile.error
      return {
        socialAgentEnabled: Boolean(user.data?.social_agent_enabled),
        shareableConfirmed: Boolean(profile.data?.shareable_confirmed),
      }
    },
  }
}
