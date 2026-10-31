// 分身／社交 Agent 開始前的檢查訊息：缺什麼就只叫用戶去做那一件（Peter 2026-10-31：沒開社交 Agent 要叫他去設定開，不要說去我的檔案）。擁有者：B。
export interface Readiness {
  socialAgentEnabled: boolean
  shareableConfirmed: boolean
}

export const NEED_PROFILE = '先到「我的档案」确认对外档案'
export const NEED_AGENT = '先到「设置」开启社交 Agent'

/** 都好了回 null；否則回一句只講缺的那幾步的話。 */
export function notReadyMessage(r: Readiness, suffix = ''): string | null {
  if (r.socialAgentEnabled && r.shareableConfirmed) return null
  const steps = [!r.shareableConfirmed ? NEED_PROFILE : '', !r.socialAgentEnabled ? NEED_AGENT : ''].filter(Boolean)
  const [first = '', second] = steps
  const text = second ? `${first}，再${second.replace(/^先/, '')}` : first
  return `${text}${suffix}`
}
