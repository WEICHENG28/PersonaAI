// 帳號：註冊、登入、游客、設定密碼。擁有者：A（登入），由 B 的 AI 依 Peter 需求撰寫。
// 登入成功回一次性 token_hash，前端用 supabase.auth.verifyOtp 換成登入狀態（不寄任何信）。
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { enterAsGuest, loginAccount, registerAccount, setAccountPassword, type AccountErrorCode, type LoginResult } from '../account/nameLogin.js'
import { supabaseAccountDeps } from '../account/supabaseDeps.js'
import { isAuthFailure, requireAuth } from '../lib/auth.js'

export const accountRoutes = new Hono()

const credentialsBody = z.object({ name: z.string().max(60), password: z.string().max(200) })
const guestBody = z.object({ name: z.string().max(60).optional() })
const passwordBody = z.object({ password: z.string().max(200), name: z.string().max(60).optional() })

const STATUS: Record<AccountErrorCode, 400 | 401 | 404 | 409> = {
  invalid: 400,
  reserved: 409,
  exists: 409,
  not_found: 404,
  no_password: 409,
  wrong_password: 401,
}

function reply(c: Context, result: LoginResult) {
  if (!result.ok) return c.json({ ok: false, code: result.code, error: result.error }, STATUS[result.code])
  const { ok: _ok, ...data } = result
  return c.json({ ok: true, data })
}

async function run(c: Context, action: string, fn: () => Promise<Response>) {
  try {
    return await fn()
  } catch (e) {
    console.error(`[account] ${action} failed`, e instanceof Error ? e.message : e)
    return c.json({ ok: false, error: '出了点问题，请再试一次' }, 500)
  }
}

accountRoutes.post('/account/register', async (c) => {
  const body = credentialsBody.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ ok: false, code: 'invalid', error: '请输入名字和密码' }, 400)
  return run(c, 'register', async () => reply(c, await registerAccount(body.data, supabaseAccountDeps())))
})

accountRoutes.post('/account/login', async (c) => {
  const body = credentialsBody.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ ok: false, code: 'invalid', error: '请输入名字和密码' }, 400)
  return run(c, 'login', async () => {
    const result = await loginAccount(body.data, supabaseAccountDeps())
    // 密碼錯了稍微等一下，讓人沒辦法很快一直猜
    if (!result.ok && result.code === 'wrong_password') await new Promise((r) => setTimeout(r, 800))
    return reply(c, result)
  })
})

accountRoutes.post('/account/guest', async (c) => {
  const body = guestBody.safeParse(await c.req.json().catch(() => ({})))
  return run(c, 'guest', async () => reply(c, await enterAsGuest(body.success ? body.data : {}, supabaseAccountDeps())))
})

accountRoutes.post('/account/password', async (c) => {
  const auth = await requireAuth(c)
  if (isAuthFailure(auth)) return auth
  const body = passwordBody.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ ok: false, code: 'invalid', error: '请输入密码' }, 400)
  return run(c, 'password', async () => {
    const result = await setAccountPassword(auth.authId, body.data, supabaseAccountDeps())
    if (!result.ok) return c.json({ ok: false, code: result.code, error: result.error }, STATUS[result.code])
    return c.json({ ok: true, data: { displayName: result.displayName || auth.displayName } })
  })
})
