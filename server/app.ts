// 後端 app：組合三條線的路由。擁有者：B（S0）。新增路由寫在 server/routes/<線>.ts，不用改這裡。
import { Hono } from 'hono'
import { friendRoutes } from './routes/friend.js'
import { socialRoutes } from './routes/social.js'
import { twinRoutes } from './routes/twin.js'

export const app = new Hono().basePath('/api')

app.get('/health', (c) => c.json({ ok: true, data: { status: 'ok' } }))

app.route('/', friendRoutes)
app.route('/', socialRoutes)
app.route('/', twinRoutes)

app.notFound((c) => c.json({ ok: false, error: '找不到这个接口' }, 404))

app.onError((err, c) => {
  console.error('[server]', c.req.method, c.req.path, err)
  return c.json({ ok: false, error: '服务器发生错误，请稍后再试' }, 500)
})
