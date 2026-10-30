// B 線的前端 API（docs/10 第 3 節）。VITE_API_MODE=http 打後端 /api，其他情況用本機 mock。擁有者：B。
import { supabase } from '../supabase'

export type TaskPurpose = 'friend' | 'study' | 'sport' | 'hobby'
export type TaskStatus = 'pending_confirm' | 'running' | 'done' | 'paused' | 'failed' | 'cancelled'

/** 和後端 shared/types.ts 的 AgentTask 同欄位（前端只取畫面用得到的）。 */
export interface TaskView {
  id: string
  raw_instruction: string | null
  restatement: string | null
  purpose: TaskPurpose
  conditions: string[]
  target_count: number
  done_condition: { suitable_count?: number; max_chats?: number; deadline?: string | null }
  status: TaskStatus
  progress: { screened: number; chats: number; suitable: number }
}

export type TaskAction = 'confirm' | 'pause' | 'resume' | 'cancel'

export const PURPOSE_LABEL: Record<TaskPurpose, string> = {
  friend: '交友',
  study: '读书伙伴',
  sport: '运动伙伴',
  hobby: '兴趣同好',
}

/** 把完成條件寫成一句話，例如「找到 2 位合适就停，最多代聊 6 场」。 */
export function describeDone(task: TaskView): string {
  const d = task.done_condition
  const parts = [
    d.suitable_count ? `找到 ${d.suitable_count} 位合适就停` : '',
    d.max_chats ? `最多代聊 ${d.max_chats} 场` : '',
    d.deadline ? `期限 ${d.deadline}` : '',
  ].filter(Boolean)
  return parts.join('，') || '未设定'
}

/** 失敗時丟出的錯誤，message 是可以直接給用戶看的中文。 */
export class ApiError extends Error {}

const useHttp = import.meta.env.VITE_API_MODE === 'http'

/** http 模式才有真的歷史資料；mock 模式頁面用 demo store。 */
export const historyFromApi = useHttp

export type AttemptResult = 'mutual' | 'one_way' | 'unsuitable' | 'ongoing'
export type ReasonType = 'not_mutual' | 'condition_mismatch' | 'friction'

/** 歷史嘗試一筆（後端不回傳任何分數）。 */
export interface HistoryEntry {
  id: string
  target_user_id: string
  target_name: string
  conversation_id: string
  origin: 'auto' | 'manual'
  result: AttemptResult
  reason_type: ReasonType | null
  reason_text: string | null
  outline: { topics: string[]; fits: string[]; frictions: string[]; highlights: string[] } | null
  reopened_at: string | null
  created_at: string
}

export function getHistory(): Promise<{ items: HistoryEntry[]; insight: string | null }> {
  return request('GET', '/api/history')
}

/** twin：讓分身再試一次（回 taskId）；human：本人去聊（回 conversationId）。 */
export function reopenHistory(id: string, mode: 'twin' | 'human'): Promise<{ mode: 'twin' | 'human'; taskId?: string; conversationId?: string }> {
  return request('POST', `/api/history/${id}/reopen`, { mode })
}

export function createTask(text: string): Promise<TaskView> {
  return useHttp ? request('POST', '/api/tasks', { text }) : mock.create(text)
}

export function getTask(id: string): Promise<TaskView> {
  return useHttp ? request('GET', `/api/tasks/${id}`) : mock.get(id)
}

export function updateTask(id: string, action: TaskAction): Promise<TaskView> {
  return useHttp ? request('POST', `/api/tasks/${id}/${action}`) : mock.update(id, action)
}

/** 帶上登入的 Supabase JWT（A0b），後端用它認出是誰。 */
async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body) headers['content-type'] = 'application/json'
  let res: Response
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('连不上服务器，请确认后端有在运行')
  }
  const json = (await res.json().catch(() => null)) as { ok: boolean; data?: T; error?: string } | null
  if (!json?.ok) throw new ApiError(json?.error ?? '服务器发生错误，请稍后再试')
  return json.data as T
}

// ── mock：不接後端也能跑完 demo ──

const mock = (() => {
  const tasks = new Map<string, TaskView>()
  let seq = 0
  const NEXT: Record<TaskAction, TaskStatus> = { confirm: 'running', pause: 'paused', resume: 'running', cancel: 'cancelled' }

  return {
    async create(text: string): Promise<TaskView> {
      const count = Math.min(Number(/(\d+)\s*[个位名]/.exec(text)?.[1] ?? 3), 10)
      const condition = /喜欢[^的，,。]+/.exec(text)?.[0]
      const purpose: TaskPurpose = /登山|爬山|跑步|运动|健身/.test(text) ? 'sport' : /读书|考试|学习/.test(text) ? 'study' : 'friend'
      const suitable = Math.min(count, 2)
      const task: TaskView = {
        id: `mock-task-${++seq}`,
        raw_instruction: text,
        restatement: `帮你找 ${count} 位${condition ?? ''}的${PURPOSE_LABEL[purpose]}，找到 ${suitable} 位合适就停，最多代聊 ${count * 2} 场，可以吗？`,
        purpose,
        conditions: condition ? [condition] : [],
        target_count: count,
        done_condition: { suitable_count: suitable, max_chats: count * 2, deadline: null },
        status: 'pending_confirm',
        progress: { screened: 0, chats: 0, suitable: 0 },
      }
      tasks.set(task.id, task)
      return { ...task }
    },
    async get(id: string): Promise<TaskView> {
      const task = tasks.get(id)
      if (!task) throw new ApiError('找不到这个任务')
      return { ...task }
    },
    async update(id: string, action: TaskAction): Promise<TaskView> {
      const task = tasks.get(id)
      if (!task) throw new ApiError('找不到这个任务')
      const next = { ...task, status: NEXT[action] }
      tasks.set(id, next)
      return { ...next }
    },
  }
})()
