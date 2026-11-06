/**
 * 頻率限制（防濫用第一層）：同一個人／同一個 IP 在一段時間內最多打幾次某類 API。
 * 記在記憶體：Vercel 同一台機器上的請求會共用，多台機器之間不共用，所以是「盡量擋」。
 * 真正花錢的地方（AI 聊天、建任務）另外有資料庫計算的每日上限（server/social/usage.ts）。擁有者：B。
 */
import type { Context, MiddlewareHandler } from 'hono'

export interface RateRule {
  /** 規則名稱（同名的路徑共用額度）。 */
  name: string
  method: 'POST' | 'GET'
  /** 比對 /api 後面的路徑。 */
  path: RegExp
  limit: number
  windowMs: number
  /** 用 IP 還是登入身分算。沒登入的請求一律用 IP。 */
  by: 'ip' | 'user'
  message: string
}

const MINUTE = 60_000

export const RATE_RULES: RateRule[] = [
  { name: 'login', method: 'POST', path: /^\/account\/login$/, limit: 10, windowMs: 10 * MINUTE, by: 'ip', message: '登录尝试太多次了，请 10 分钟后再试' },
  { name: 'signup', method: 'POST', path: /^\/account\/(register|guest)$/, limit: 8, windowMs: 10 * MINUTE, by: 'ip', message: '建立帐号太频繁了，请稍后再试' },
  { name: 'friend-chat', method: 'POST', path: /^\/friend\/chat$/, limit: 20, windowMs: MINUTE, by: 'user', message: '说得太快了，休息一下再继续聊吧' },
  { name: 'live-chat', method: 'POST', path: /^\/conversations\/[^/]+\/messages$/, limit: 30, windowMs: MINUTE, by: 'user', message: '消息发得太快了，请稍后再发' },
  {
    name: 'ai-actions',
    method: 'POST',
    path: /^\/(tasks|lobby\/assistant|lobby\/twin-chat|conversations|conversations\/[^/]+\/continue|profile\/extract|profile\/fun|onboarding\/(quick-profile|join-lobby|first-task))$/,
    limit: 15,
    windowMs: MINUTE,
    by: 'user',
    message: '操作太频繁了，请稍后再试',
  },
  { name: 'client-errors', method: 'POST', path: /^\/client-errors$/, limit: 20, windowMs: 10 * MINUTE, by: 'ip', message: '回报太频繁了' },
  { name: 'safety', method: 'POST', path: /^\/safety\/(report|block|unblock)$/, limit: 20, windowMs: 10 * MINUTE, by: 'user', message: '操作太频繁了，请稍后再试' },
]

/** 滑動視窗計數器。 */
export function createLimiter(now: () => number = Date.now) {
  const hits = new Map<string, number[]>()
  let calls = 0
  return {
    /** 記一次；回傳 true＝還在額度內。 */
    hit(key: string, limit: number, windowMs: number): boolean {
      const t = now()
      const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs)
      const allowed = recent.length < limit
      if (allowed) recent.push(t)
      hits.set(key, recent)
      // 偶爾清掉過期的 key，避免記憶體一直長
      if (++calls % 500 === 0) for (const [k, v] of hits) if (!v.some((x) => t - x < 60 * MINUTE)) hits.delete(k)
      return allowed
    },
  }
}

export function clientIp(c: Context): string {
  const fwd = c.req.header('x-forwarded-for')
  return fwd?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'unknown'
}

/** 用 token 的最後一段當身分（不解碼、不存 token 本身）；沒登入就用 IP。 */
function identity(c: Context, by: RateRule['by']): string {
  const auth = c.req.header('Authorization')
  if (by === 'user' && auth?.startsWith('Bearer ')) return `u:${auth.slice(-24)}`
  return `ip:${clientIp(c)}`
}

export function rateLimitMiddleware(rules: RateRule[] = RATE_RULES, limiter = createLimiter()): MiddlewareHandler {
  return async (c, next) => {
    const path = c.req.path.replace(/^\/api/, '')
    const rule = rules.find((r) => r.method === c.req.method && r.path.test(path))
    if (rule && !limiter.hit(`${rule.name}|${identity(c, rule.by)}`, rule.limit, rule.windowMs)) {
      return c.json({ ok: false, code: 'rate_limited', error: rule.message }, 429)
    }
    await next()
  }
}
