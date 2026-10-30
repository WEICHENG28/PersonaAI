import type { TaskReport } from '@/lib/types'

/**
 * A 線 deliverReport stub（07 §6）。A6 完成時換成真實作：新增一筆
 * `friend_report` 通知，下次見面時由 AI 朋友說出來。
 */
export async function deliverReport(userId: string, report: TaskReport): Promise<void> {
  void report
  throw new Error(`deliverReport 尚未實作（A6 交付）。userId=${userId}`)
}
