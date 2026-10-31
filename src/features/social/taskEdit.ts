// 確認卡編輯的純函式（不碰畫面，方便測試）。範圍和後端 editTask 一致。擁有者：B。
import type { TaskEdit } from '../../lib/api/social'

export const MAX_COUNT = 10
export const MAX_CHATS = 30

export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(n), min), max)
}

/** 人數改小時，「找到幾位就停」和「最多代聊幾場」跟著調整，永遠合理。 */
export function normalize(e: TaskEdit): TaskEdit {
  const count = clamp(e.count, 1, MAX_COUNT)
  const suitable = clamp(e.suitable_count, 1, count)
  return { ...e, count, suitable_count: suitable, max_chats: clamp(e.max_chats, suitable, MAX_CHATS) }
}

export function splitConditions(text: string): string[] {
  return text
    .split(/[、，,;；\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8)
}

