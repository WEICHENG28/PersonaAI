// 管理後台 API（http 模式）：用管理密碼（Vercel 的 ADMIN_SECRET）呼叫 /api/admin/*。
// 密碼只存在這個分頁（sessionStorage），關掉分頁就要重新輸入。擁有者：B。

const KEY = 'personaai:adminSecret'

export function getAdminSecret(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setAdminSecret(secret: string | null): void {
  try {
    if (secret) sessionStorage.setItem(KEY, secret)
    else sessionStorage.removeItem(KEY)
  } catch {
    /* 存不了就每次重新輸入 */
  }
}

export class AdminAuthError extends Error {}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const secret = getAdminSecret()
  if (!secret) throw new AdminAuthError('请输入管理密码')
  let res: Response
  try {
    res = await fetch(path, {
      method,
      headers: { Authorization: `Bearer ${secret}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('连不上服务器')
  }
  const json = (await res.json().catch(() => null)) as { ok: boolean; data?: T; error?: string } | null
  if (res.status === 401) throw new AdminAuthError('管理密码不对（或服务器还没设定 ADMIN_SECRET）')
  if (!json?.ok) throw new Error(json?.error ?? '服务器发生错误')
  return json.data as T
}

export interface AdminOverview {
  users: number
  newUsers24h: number
  activeUsers24h: number
  inLobby: number
  friendMessages24h: number
  liveMessages24h: number
  tasks24h: number
  reports7d: number
  health: { database: string; llm: string; missingEnv: string[] }
}

export interface FunnelRow {
  step: string
  label: string
  users: number
  percent: number
}

export interface AdminReport {
  at: string
  reporter: { id: string; name: string | null }
  target: { id: string | null; name: string | null }
  reason: string | null
  note: string | null
  conversationId: string | null
}

export interface AdminUser {
  id: string
  name: string
  createdAt: string
  inLobby: boolean
  guest: boolean
  hasPassword: boolean
  banned: boolean
  reportedBy: number
  friendMessages: number
}

export interface AdminError {
  at: string
  source: 'server' | 'web' | 'worker'
  where: string
  message: string
  count: number
}

export const adminApi = {
  overview: () => call<AdminOverview>('GET', '/api/admin/overview'),
  funnel: (days: number) => call<{ days: number; funnel: FunnelRow[] }>('GET', `/api/admin/funnel?days=${days}`),
  reports: () => call<AdminReport[]>('GET', '/api/admin/reports?limit=100'),
  users: (q: string) => call<AdminUser[]>('GET', `/api/admin/users?q=${encodeURIComponent(q)}`),
  errors: () => call<AdminError[]>('GET', '/api/admin/errors'),
  ban: (userId: string, banned: boolean, reason?: string) => call<{ userId: string; name: string; banned: boolean }>('POST', '/api/admin/ban', { userId, banned, reason }),
}
