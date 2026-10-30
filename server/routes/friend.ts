// A 線的 API 路由，掛在 /api 底下（例如 friendRoutes.get('/xxx') → GET /api/xxx）。擁有者：A。
// 回應格式：成功 { ok: true, data }，失敗 { ok: false, error: '给用户看的简体中文讯息' }。
import { Hono } from 'hono'

export const friendRoutes = new Hono()
