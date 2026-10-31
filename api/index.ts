// Vercel Function：把整個後端（server/app.ts，Hono）放在同一個網址的 /api 底下。
// vercel.json 把所有 /api/* 轉到這個檔案；Hono 依原本的網址路徑分派到各線路由。
// 本機開發仍用 npm run server（server/index.ts），兩邊共用同一份 app。
// 注意：社交 Agent 的背景迴圈（npm run worker）是長時間執行的程式，不能放在 Vercel，要另外在一台電腦上跑。
import { handle } from 'hono/vercel'
import { app } from '../server/app.js'

const handler = handle(app)

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
export const OPTIONS = handler
