// B8｜效率統計（02 第 4 節）：附計算依據，人工平均時間由用戶設定。擁有者：B。
import type { TaskProgress } from '../../shared/types'

export interface TaskStats {
  screened: number
  chats: number
  suitable: number
  saved_minutes: number
  basis: string
}

export function computeStats(progress: TaskProgress, manualMinutesPerChat: number): TaskStats {
  return {
    screened: progress.screened,
    chats: progress.chats,
    suitable: progress.suitable,
    saved_minutes: progress.chats * manualMinutesPerChat,
    basis: `代聊 ${progress.chats} 场 × 人工平均 ${manualMinutesPerChat} 分钟`,
  }
}

/** 分鐘數換成好讀的說法：120 → 「约 2 小时」、150 → 「约 2 小时 30 分钟」、45 → 「约 45 分钟」。 */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `约 ${m} 分钟`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `约 ${h} 小时 ${rest} 分钟` : `约 ${h} 小时`
}
