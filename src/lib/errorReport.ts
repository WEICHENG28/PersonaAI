// 網頁錯誤回報（錯誤監測）：畫面上沒接住的錯誤送到後端 /api/client-errors，
// 管理後台「最近错误」看得到，有設群組機器人也會推通知。同一則錯誤只送一次，每次開網頁最多送 10 則。擁有者：B。
import { isHttpMode } from './supabase'

const MAX_REPORTS = 10

export function installErrorReporting(): void {
  if (!isHttpMode || typeof window === 'undefined') return
  const sent = new Set<string>()

  const report = (message: string) => {
    const text = message.slice(0, 500)
    if (!text || sent.has(text) || sent.size >= MAX_REPORTS) return
    sent.add(text)
    void fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: text, where: window.location.pathname.replace(/[0-9a-f-]{36}/g, ':id') }),
      keepalive: true,
    }).catch(() => {})
  }

  window.addEventListener('error', (e) => report(e.message || String(e.error ?? '')))
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason
    report(r instanceof Error ? r.message : typeof r === 'string' ? r : '未处理的错误')
  })
}
