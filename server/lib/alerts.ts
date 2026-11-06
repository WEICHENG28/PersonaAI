/**
 * 錯誤監測（不用裝套件）：伺服器和網頁出錯時
 * 1. 記在這台機器的「最近錯誤」（管理後台看得到；Vercel 多台機器之間不共用，完整紀錄看 Vercel Logs）；
 * 2. 有設 ALERT_WEBHOOK_URL 就推到群組機器人（飛書／企業微信／Discord／Slack，用 ALERT_WEBHOOK_KIND 選格式）。
 *    同一個錯誤 10 分鐘內只推一次，每小時最多推 20 則，避免洗版。
 * 擁有者：B。
 */
import { runInBackground } from './background.js'

export interface ErrorEntry {
  at: string
  source: 'server' | 'web' | 'worker'
  where: string
  message: string
  count: number
}

const MAX_ENTRIES = 50
const SAME_ERROR_MS = 10 * 60_000
const MAX_ALERTS_PER_HOUR = 20

const entries: ErrorEntry[] = []
const lastSent = new Map<string, number>()
let sentThisHour: number[] = []

export function recentErrors(): ErrorEntry[] {
  return [...entries]
}

/** 測試用。 */
export function resetAlertsForTest(): void {
  entries.length = 0
  lastSent.clear()
  sentThisHour = []
}

export type WebhookKind = 'feishu' | 'wecom' | 'discord' | 'slack'

export function webhookPayload(kind: WebhookKind, text: string): unknown {
  switch (kind) {
    case 'feishu':
      return { msg_type: 'text', content: { text } }
    case 'wecom':
      return { msgtype: 'text', text: { content: text } }
    case 'discord':
      return { content: text.slice(0, 1900) }
    default:
      return { text }
  }
}

/** 決定這則要不要推（同一錯誤 10 分鐘一次、每小時最多 20 則）。 */
export function shouldAlert(key: string, now: number): boolean {
  sentThisHour = sentThisHour.filter((t) => now - t < 60 * 60_000)
  const last = lastSent.get(key)
  if (last !== undefined && now - last < SAME_ERROR_MS) return false
  if (sentThisHour.length >= MAX_ALERTS_PER_HOUR) return false
  lastSent.set(key, now)
  sentThisHour.push(now)
  return true
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  return typeof err === 'string' ? err : JSON.stringify(err)
}

/** 記一筆錯誤（不會丟錯）。 */
export function recordError(source: ErrorEntry['source'], where: string, err: unknown, now = Date.now()): void {
  try {
    const message = messageOf(err).slice(0, 300)
    const key = `${source}|${where}|${message}`
    const existing = entries.find((e) => `${e.source}|${e.where}|${e.message}` === key)
    if (existing) {
      existing.count++
      existing.at = new Date(now).toISOString()
    } else {
      entries.unshift({ at: new Date(now).toISOString(), source, where, message, count: 1 })
      if (entries.length > MAX_ENTRIES) entries.pop()
    }

    const url = process.env.ALERT_WEBHOOK_URL
    if (!url || !shouldAlert(key, now)) return
    const kind = (process.env.ALERT_WEBHOOK_KIND as WebhookKind | undefined) ?? 'slack'
    const label = { server: '后端', web: '网页', worker: 'worker' }[source]
    const text = `【PersonaAI 错误】${label}｜${where}\n${message}`
    runInBackground(
      fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(webhookPayload(kind, text)),
        signal: AbortSignal.timeout(3000),
      }).catch(() => {}),
    )
  } catch {
    // 監測本身不能讓主流程出錯
  }
}
