// 後端進入點：npm run server。前端 dev server 會把 /api 代理到這裡（vite.config.ts）。
import { serve } from '@hono/node-server'
import { existsSync } from 'node:fs'
import { app } from './app.js'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const port = Number(process.env.PORT ?? 8787)

serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info) => {
  console.log(`[server] http://127.0.0.1:${info.port}/api/health`)
})
