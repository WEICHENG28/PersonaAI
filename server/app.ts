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

app.notFound((c) => c.json({ ok: false, error: '找不到这个接口' }, 404))

app.onError((err, c) => {
  // 防濫用的錯誤是給用戶看的：敏感詞 400、每日上限 429、屏蔽／檢舉的輸入錯誤 400/404
  if (err instanceof BlockedContentError || err instanceof UsageLimitError || err instanceof SafetyError || err instanceof OnboardingError) {
    return c.json({ ok: false, error: err.message }, err.status)
  }
  console.error('[server]', c.req.method, c.req.path, err)
  return c.json({ ok: false, error: '服务器发生错误，请稍后再试' }, 500)
})
