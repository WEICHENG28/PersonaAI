// 社交 Agent 迴圈要讀寫的資料。有 Supabase 就用資料庫，沒有就用記憶體（本機開發、測試）。擁有者：B。
// 注意：conversations 是 C 的表，這裡只「讀」狀態（是否結束、我方是否已接手）；寫入一律透過 C 的 contracts。
import type { AgentTask, AttemptResult, Controller, MatchTier, Outline, Preferences, ReasonType } from '../../shared/types'
import { getAdminDb } from './db'
import { sharedMemoryTasks } from './taskStore'

export type TaskPatch = Partial<Pick<AgentTask, 'status' | 'progress' | 'active_conversation_id' | 'attempted_user_ids'>>

export interface UserSettings {
  match_tier: MatchTier
  preferences: Preferences
  daily_chat_limit: number
  manual_minutes_per_chat: number
}

export interface ConversationState {
  status: 'active' | 'waiting_human' | 'ended'
  sideAController: Controller
  sideBController: Controller
}

export interface AttemptRecord {
  user_id: string
  target_user_id: string
  conversation_id: string
  task_id: string
  origin: 'auto' | 'manual'
  result: Exclude<AttemptResult, 'ongoing'>
  reason_type: ReasonType | null
  reason_text: string | null
  outline: Outline | null
}

/** 歷史嘗試頁看到的一筆（不含任何分數）。 */
export interface HistoryItem extends AttemptRecord {
  id: string
  target_name: string
  reopened_at: string | null
  created_at: string
}

/** match_scores 一列（每個視角一列；只給後台用，前端讀不到）。 */
export interface ScoreRow {
  conversation_id: string
  perspective_user_id: string
  round: number
  runs: unknown[]
  direction_score: number
  verdict: string
  reason_type: ReasonType | null
  reason_text: string | null
}

export interface AgentStore {
  getTask(id: string): Promise<AgentTask | null>
  updateTask(id: string, patch: TaskPatch): Promise<AgentTask>
  listRunningTaskIds(): Promise<string[]>
  /** 失敗次數 +1，回傳新的次數；reset 時歸零。 */
  bumpFailCount(id: string): Promise<number>
  resetFailCount(id: string): Promise<void>
  userSettings(userId: string): Promise<UserSettings>
  displayName(userId: string): Promise<string>
  /** 種子用戶（is_seed）不需要幫他寫歷史紀錄。 */
  isSeedUser(userId: string): Promise<boolean>
  /** 今天這位用戶自動發起的代聊場數。 */
  countAutoChatsSince(userId: string, since: Date): Promise<number>
  conversationState(conversationId: string): Promise<ConversationState | null>
  recordAttempt(record: AttemptRecord): Promise<void>
  recordScores(rows: ScoreRow[]): Promise<void>
  /** 這位用戶的歷史嘗試，新的在前。 */
  listAttempts(userId: string, limit: number): Promise<HistoryItem[]>
  getAttempt(id: string): Promise<HistoryItem | null>
  markReopened(id: string, at: Date): Promise<void>
  notifyMatch(userId: string, payload: Record<string, unknown>): Promise<void>
}

let override: AgentStore | null = null

/** 測試用：傳 null 還原。 */
export function setAgentStore(store: AgentStore | null): void {
  override = store
}

let memory: MemoryAgentStore | null = null

export function getAgentStore(): AgentStore {
  if (override) return override
  const db = getAdminDb()
  if (db) return supabaseStore(db)
  memory ??= new MemoryAgentStore(sharedMemoryTasks)
  return memory
}

/** 記憶體版：測試時直接塞資料、事後檢查 attempts／notifications。 */
export class MemoryAgentStore implements AgentStore {
  constructor(public tasks: Map<string, AgentTask> = new Map()) {}
  failCounts = new Map<string, number>()
  conversations = new Map<string, ConversationState>()
  attempts: HistoryItem[] = []
  scores: ScoreRow[] = []
  notifications: { userId: string; payload: Record<string, unknown> }[] = []
  autoChatsToday = 0
  settings: UserSettings = { match_tier: 'mutual', preferences: { personality: 'similar', conditions: [] }, daily_chat_limit: 10, manual_minutes_per_chat: 20 }

  async getTask(id: string) {
    const t = this.tasks.get(id)
    return t ? structuredClone(t) : null
  }
  async updateTask(id: string, patch: TaskPatch) {
    const t = this.tasks.get(id)
    if (!t) throw new Error(`task ${id} not found`)
    const next = { ...t, ...structuredClone(patch) }
    this.tasks.set(id, next)
    return structuredClone(next)
  }
  async listRunningTaskIds() {
    return [...this.tasks.values()].filter((t) => t.status === 'running').map((t) => t.id)
  }
  async bumpFailCount(id: string) {
    const n = (this.failCounts.get(id) ?? 0) + 1
    this.failCounts.set(id, n)
    return n
  }
  async resetFailCount(id: string) {
    this.failCounts.set(id, 0)
  }
  async userSettings() {
    return { ...this.settings }
  }
  async displayName(userId: string) {
    return userId
  }
  seedUserIds = new Set<string>()
  async isSeedUser(userId: string) {
    return this.seedUserIds.has(userId)
  }
  async countAutoChatsSince() {
    return this.autoChatsToday
  }
  async conversationState(id: string) {
    return this.conversations.get(id) ?? { status: 'active' as const, sideAController: 'twin' as const, sideBController: 'twin' as const }
  }
  async recordAttempt(record: AttemptRecord) {
    const item = { ...structuredClone(record), id: `attempt-${this.attempts.length + 1}`, target_name: record.target_user_id, reopened_at: null, created_at: new Date().toISOString() }
    this.attempts.push(item)
  }
  async listAttempts(userId: string, limit: number) {
    return this.attempts.filter((a) => a.user_id === userId).reverse().slice(0, limit).map((a) => structuredClone(a))
  }
  async getAttempt(id: string) {
    const a = this.attempts.find((x) => x.id === id)
    return a ? structuredClone(a) : null
  }
  async markReopened(id: string, at: Date) {
    const a = this.attempts.find((x) => x.id === id)
    if (a) a.reopened_at = at.toISOString()
  }
  async recordScores(rows: ScoreRow[]) {
    this.scores.push(...structuredClone(rows))
  }
  async notifyMatch(userId: string, payload: Record<string, unknown>) {
    this.notifications.push({ userId, payload })
  }
}

type Db = NonNullable<ReturnType<typeof getAdminDb>>

const TASK_COLUMNS =
  'id,user_id,kind,raw_instruction,restatement,purpose,conditions,target_count,done_condition,target_user_id,status,progress,active_conversation_id,attempted_user_ids'

function supabaseStore(db: Db): AgentStore {
  const one = async <T>(q: PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> => {
    const { data, error } = await q
    if (error) throw error
    return data
  }
  return {
    getTask: (id) => one(db.from('agent_tasks').select(TASK_COLUMNS).eq('id', id).maybeSingle()) as Promise<AgentTask | null>,
    async updateTask(id, patch) {
      const row = await one(
        db.from('agent_tasks').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select(TASK_COLUMNS).single(),
      )
      return row as unknown as AgentTask
    },
    async listRunningTaskIds() {
      const rows = (await one(db.from('agent_tasks').select('id').eq('status', 'running'))) as { id: string }[] | null
      return (rows ?? []).map((r) => r.id)
    },
    async bumpFailCount(id) {
      const row = (await one(db.from('agent_tasks').select('fail_count').eq('id', id).single())) as { fail_count: number }
      const next = row.fail_count + 1
      await one(db.from('agent_tasks').update({ fail_count: next }).eq('id', id))
      return next
    },
    async resetFailCount(id) {
      await one(db.from('agent_tasks').update({ fail_count: 0 }).eq('id', id))
    },
    async userSettings(userId) {
      const row = await one(db.from('users').select('match_tier,preferences,daily_chat_limit,manual_minutes_per_chat').eq('id', userId).single())
      return row as unknown as UserSettings
    },
    async displayName(userId) {
      const row = (await one(db.from('users').select('display_name').eq('id', userId).maybeSingle())) as { display_name: string } | null
      return row?.display_name ?? '对方'
    },
    async isSeedUser(userId) {
      const row = (await one(db.from('users').select('is_seed').eq('id', userId).maybeSingle())) as { is_seed: boolean } | null
      return row?.is_seed ?? true
    },
    async countAutoChatsSince(userId, since) {
      const { count, error } = await db
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('side_a', userId)
        .eq('origin', 'auto')
        .gte('created_at', since.toISOString())
      if (error) throw error
      return count ?? 0
    },
    async conversationState(id) {
      const row = (await one(db.from('conversations').select('status,side_a_controller,side_b_controller').eq('id', id).maybeSingle())) as {
        status: ConversationState['status']
        side_a_controller: Controller
        side_b_controller: Controller
      } | null
      return row ? { status: row.status, sideAController: row.side_a_controller, sideBController: row.side_b_controller } : null
    },
    async recordAttempt(record) {
      await one(db.from('match_attempts').insert(record))
    },
    async listAttempts(userId, limit) {
      const rows = (await one(
        db.from('match_attempts').select(HISTORY_COLUMNS).eq('user_id', userId).order('created_at', { ascending: false }).limit(limit),
      )) as unknown as HistoryRow[] | null
      return (rows ?? []).map(toHistoryItem)
    },
    async getAttempt(id) {
      const row = (await one(db.from('match_attempts').select(HISTORY_COLUMNS).eq('id', id).maybeSingle())) as unknown as HistoryRow | null
      return row ? toHistoryItem(row) : null
    },
    async markReopened(id, at) {
      await one(db.from('match_attempts').update({ reopened_at: at.toISOString() }).eq('id', id))
    },
    async recordScores(rows) {
      await one(db.from('match_scores').insert(rows))
    },
    async notifyMatch(userId, payload) {
      await one(db.from('notifications').insert({ user_id: userId, type: 'match', payload }))
    },
  }
}

const HISTORY_COLUMNS =
  'id,user_id,target_user_id,conversation_id,task_id,origin,result,reason_type,reason_text,outline,reopened_at,created_at,target:users!match_attempts_target_user_id_fkey(display_name)'

type HistoryRow = Omit<HistoryItem, 'target_name'> & { target: { display_name: string } | { display_name: string }[] | null }

function toHistoryItem(row: HistoryRow): HistoryItem {
  const { target, ...rest } = row
  const t = Array.isArray(target) ? target[0] : target
  return { ...rest, target_name: t?.display_name ?? '对方' }
}
