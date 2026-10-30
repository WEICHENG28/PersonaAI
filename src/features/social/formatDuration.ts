/** 分鐘數換成好讀的說法：120 → 「约 2 小时」（和後端 server/social/stats.ts 的 formatDuration 一致）。 */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `约 ${m} 分钟`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `约 ${h} 小时 ${rest} 分钟` : `约 ${h} 小时`
}
