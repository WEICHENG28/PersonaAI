// C 線的 API 路由，掛在 /api 底下（例如 twinRoutes.get('/xxx') → GET /api/xxx）。擁有者：C。
// 回應格式：成功 { ok: true, data }，失敗 { ok: false, error: '给用户看的简体中文讯息' }。
import { Hono } from 'hono'

export const twinRoutes = new Hono()
