// 後端 app：組合三條線的路由。擁有者：B（S0）。新增路由寫在 server/routes/<線>.ts，不用改這裡。
import { Hono } from 'hono'
import { accountRoutes } from './routes/account.js'
import { friendRoutes } from './routes/friend.js'
import { socialRoutes } from './routes/social.js'
import { twinRoutes } from './routes/twin.js'
import { deepHealth } from './health.js'
import { adminRoutes } from './routes/admin.js'
import { rateLimitMiddleware } from './lib/rateLimit.js'
import { BlockedContentError } from './lib/moderation.js'
import { UsageLimitError } from './social/usage.js'
import { SafetyError } from './social/safety.js'
import { OnboardingError } from './social/onboarding.js'
import { recordError } from './lib/alerts.js'
import { z } from 'zod'

export const app = new Hono().basePath('/api')

// 防濫用：頻率限制（server/lib/rateLimit.ts 的規則）
app.use('*', rateLimitMiddleware())

app.get('/health', (c) => c.json({ ok: true, data: { status: 'ok' } }))

// 部署檢查：環境變數有沒有設、資料庫與 AI 連不連得上（不回任何值）
app.get('/health/deep', async (c) => c.json({ ok: true, data: await deepHealth() }))

app.route('/', accountRoutes)
app.route('/', friendRoutes)
app.route('/', socialRoutes)
app.route('/', twinRoutes)
app.route('/', adminRoutes)

// 網頁端的錯誤回報（src/lib/errorReport.ts）：不需要登入，有頻率限制
const clientErrorBody = z.object({ message: z.string().max(500), where: z.string().max(200).optional() })
app.post('/client-errors', async (c) => {
  const body = clientErrorBody.safeParse(await c.req.json().catch(() => null))
  if (body.success) recordError('web', body.data.where ?? '网页', body.data.message)
  return c.json({ ok: true, data: null })
})

app.notFound((c) => c.json({ ok: false, error: '找不到这个接口' }, 404))

app.onError((err, c) => {
  // 防濫用的錯誤是給用戶看的：敏感詞 400、每日上限 429、屏蔽／檢舉的輸入錯誤 400/404
  if (err instanceof BlockedContentError || err instanceof UsageLimitError || err instanceof SafetyError || err instanceof OnboardingError) {
    return c.json({ ok: false, error: err.message }, err.status)
  }
  console.error('[server]', c.req.method, c.req.path, err)
  // 錯誤監測：記到管理後台「最近错误」，有設 ALERT_WEBHOOK_URL 就推到群組
  recordError('server', `${c.req.method} ${c.req.path.replace(/[0-9a-f-]{36}/g, ':id')}`, err)
  return c.json({ ok: false, error: '服务器发生错误，请稍后再试' }, 500)
})
