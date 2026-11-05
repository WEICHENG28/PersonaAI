/**
 * 每人每日用量上限（防濫用：AI 呼叫是花錢的）。用資料庫已有的紀錄算最近 24 小時，不用 migration。
 * 沒接資料庫（測試、本機記憶體模式）時不限制。擁有者：B。
 */
import { CONFIG } from '../lib/config.js'
import { getAdminDb } from './db.js'

export type UsageKind = 'friend_message' | 'live_message' | 'task'

export class UsageLimitError extends Error {
  readonly status = 429
  constructor(message: string) {
    super(message)
    this.name = 'UsageLimitError'
  }
}

const LIMITS: Record<UsageKind, { limit: () => number; message: string }> = {
  friend_message: { limit: () => CONFIG.DAILY_FRIEND_MESSAGES, message: '今天和阿澈聊了好多啦，让它休息一下，明天再聊吧' },
  live_message: { limit: () => CONFIG.DAILY_LIVE_MESSAGES, message: '今天发的消息已经到上限了，明天再继续吧' },
  task: { limit: () => CONFIG.DAILY_TASKS, message: '今天交办的找人任务已经到上限了，明天再来吧' },
}

export type UsageCounter = (kind: UsageKind, userId: string, since: Date) => Promise<number>

let override: UsageCounter | null = null
/** 測試用：傳 null 還原。 */
export function setUsageCounter(counter: UsageCounter | null): void {
  override = counter
}

/** 超過上限就丟出 UsageLimitError（429）。 */
export async function assertWithinDailyLimit(kind: UsageKind, userId: string, now = new Date()): Promise<void> {
  const counter = override ?? defaultCounter()
  if (!counter) return
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const used = await counter(kind, userId, since)
  if (used >= LIMITS[kind].limit()) throw new UsageLimitError(LIMITS[kind].message)
}

function defaultCounter(): UsageCounter | null {
  const db = getAdminDb()
  if (!db) return null
  return async (kind, userId, since) => {
    const iso = since.toISOString()
    const q =
      kind === 'friend_message'
        ? db.from('friend_messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('role', 'user').gte('created_at', iso)
        : kind === 'live_message'
          ? db.from('messages').select('id', { count: 'exact', head: true }).eq('sender_id', userId).eq('is_ai', false).gte('created_at', iso)
          : db.from('agent_tasks').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', iso)
    const { count, error } = await q
    // 算不出來就放行（不要因為計數失敗讓人不能用）
    if (error) {
      console.error('[usage] 计数失败', kind, error.message)
      return 0
    }
    return count ?? 0
  }
}
