// 名字帳號登入：POST /api/account/enter。擁有者：A（登入），由 B 的 AI 依 Peter 需求撰寫。
// 回傳一次性 token_hash，前端用 supabase.auth.verifyOtp 換成登入狀態（不寄任何信）。
import { Hono } from 'hono'
import { z } from 'zod'
import { nameLogin } from '../account/nameLogin.js'
import { supabaseNameLoginDeps } from '../account/supabaseDeps.js'

export const accountRoutes = new Hono()

const enterBody = z.object({
  mode: z.enum(['name', 'random']),
  name: z.string().max(60).optional(),
  confirmExisting: z.boolean().optional(),
})

accountRoutes.post('/account/enter', async (c) => {
  const body = enterBody.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ ok: false, error: '请输入名字，或按「随机名字」' }, 400)
  let result
  try {
    result = await nameLogin(body.data, supabaseNameLoginDeps())
  } catch (e) {
    console.error('[account] enter failed', e instanceof Error ? e.message : e)
    return c.json({ ok: false, error: '登录失败了，请再试一次' }, 500)
  }
  if (result.ok) return c.json({ ok: true, data: { displayName: result.displayName, tokenHash: result.tokenHash, created: result.created } })
  return c.json({ ok: false, code: result.code, error: result.error, displayName: result.displayName }, result.code === 'invalid' ? 400 : 409)
})
