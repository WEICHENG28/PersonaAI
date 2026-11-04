// 帳號（Peter 2026-11-04 決定）：名字＋密碼註冊／登入；評審或想看看的人可以「游客体验」一鍵進入，
// 之後在設定頁設密碼就變成正式帳號（記錄都保留）。原本「輸入名字按是我就進入」的做法已拿掉（任何人都能進別人的帳號）。
// 舊的只有名字的帳號：在原本登入過的瀏覽器到設定頁設密碼即可。
// 帳號狀態放在 Supabase 的 app_metadata（用戶自己改不了）：has_password、guest。
// 擁有者：A（登入），由 B 的 AI 依 Peter 需求撰寫。
import { randomName } from '../../src/features/friend/randomName.js'

export const NAME_MAX = 20
export const PASSWORD_MIN = 6
export const PASSWORD_MAX = 64

export interface AccountInfo {
  authId: string
  /** 帳號原本有沒有 email（舊的匿名帳號沒有，登入前要補一個內部 email） */
  email: string | null
  hasPassword: boolean
  guest: boolean
}

export interface AccountDeps {
  /** 非種子用戶裡叫這個名字的帳號（同名有多個時取最新的）。 */
  findAccount(name: string): Promise<AccountInfo | null>
  /** 用 auth id 找帳號（設定密碼用）。 */
  getAccount(authId: string): Promise<AccountInfo | null>
  /** 種子用戶的名字保留，不能拿來註冊或登入。 */
  isReservedName(name: string): Promise<boolean>
  /** 建立已驗證的新帳號（不寄信），回傳 auth id。 */
  createAccount(email: string, displayName: string, opts: { password?: string; guest?: boolean }): Promise<string>
  /** 密碼對不對。 */
  verifyPassword(email: string, password: string): Promise<boolean>
  /** 設定密碼（＝變成正式帳號），可順便補 email、改名字。 */
  upgradeAccount(authId: string, patch: { password: string; email?: string; displayName?: string }): Promise<void>
  /** 產生已存在帳號的一次性登入憑證（不寄信）。verificationType 給前端 verifyOtp 用。 */
  issueLogin(email: string): Promise<LoginToken>
  /** 建立 users 列（冪等），佔住這個名字。 */
  ensureProfile(authId: string, email: string, displayName: string): Promise<void>
  random?: () => number
}

export interface LoginToken {
  tokenHash: string
  verificationType: string
}

export type AccountErrorCode = 'invalid' | 'reserved' | 'exists' | 'not_found' | 'no_password' | 'wrong_password'

export type LoginResult =
  | { ok: true; displayName: string; tokenHash: string; verificationType: string; created: boolean; guest: boolean }
  | { ok: false; code: AccountErrorCode; error: string }

export type UpgradeResult = { ok: true; displayName: string } | { ok: false; code: AccountErrorCode; error: string }

/** 舊的匿名帳號補 email 用：不寄信、不給人看，只是 Supabase 登入需要一個 email。 */
export function internalEmail(authId: string): string {
  return `${authId}@users.personaai.app`
}

export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

function fail(code: AccountErrorCode, error: string): { ok: false; code: AccountErrorCode; error: string } {
  return { ok: false, code, error }
}

function checkName(raw: string | undefined): string | null {
  const name = cleanName(raw ?? '')
  return name && name.length <= NAME_MAX ? name : null
}

export function checkPassword(password: string | undefined): string | null {
  if (!password || password.length < PASSWORD_MIN) return `密码至少 ${PASSWORD_MIN} 个字`
  if (password.length > PASSWORD_MAX) return `密码最多 ${PASSWORD_MAX} 个字`
  return null
}

/** 註冊：名字沒人用才建立，帶密碼。 */
export async function registerAccount(input: { name?: string; password?: string }, deps: AccountDeps): Promise<LoginResult> {
  const name = checkName(input.name)
  if (!name) return fail('invalid', `名字要在 1–${NAME_MAX} 个字之间`)
  const pwError = checkPassword(input.password)
  if (pwError) return fail('invalid', pwError)
  if ((await deps.isReservedName(name)) || (await deps.findAccount(name))) {
    return fail('exists', '这个名字已经被注册了。是你的话请切到「登录」，不是的话请换一个名字')
  }
  return createAndEnter(name, deps, { password: input.password })
}

/** 登入：名字＋密碼。 */
export async function loginAccount(input: { name?: string; password?: string }, deps: AccountDeps): Promise<LoginResult> {
  const name = checkName(input.name)
  if (!name || !input.password) return fail('invalid', '请输入名字和密码')
  const account = await deps.findAccount(name)
  if (!account || (await deps.isReservedName(name))) return fail('not_found', '找不到这个名字的帐号，要不要先注册？')
  if (!account.hasPassword || !account.email) {
    return fail('no_password', '这个帐号还没设密码。请在原来登录过的浏览器打开网站，到「设置」设一个密码后再登录')
  }
  if (!(await deps.verifyPassword(account.email, input.password))) return fail('wrong_password', '名字或密码不对')
  const token = await deps.issueLogin(account.email)
  return { ok: true, displayName: name, ...token, created: false, guest: false }
}

/**
 * 游客：不用密碼直接進入。random=true（沒改過的隨機名字）→ 保證挑一個沒人用的；
 * 自己打的名字 → 有人用了就請他換一個（不會進到別人的帳號）。
 */
export async function enterAsGuest(input: { name?: string; random?: boolean }, deps: AccountDeps): Promise<LoginResult> {
  if (input.random !== false || !input.name?.trim()) {
    return createAndEnter(await uniqueRandomName(input.name, deps), deps, { guest: true })
  }
  const name = checkName(input.name)
  if (!name) return fail('invalid', `名字要在 1–${NAME_MAX} 个字之间`)
  if ((await deps.isReservedName(name)) || (await deps.findAccount(name))) {
    return fail('exists', '这个名字已经有人用了，换一个，或按旁边的按钮随机一个')
  }
  return createAndEnter(name, deps, { guest: true })
}

/**
 * 設定或修改密碼（要已登入）。游客／舊帳號設了密碼就是正式帳號；游客可以順便換名字。
 */
export async function setAccountPassword(
  authId: string,
  input: { password?: string; name?: string },
  deps: AccountDeps,
): Promise<UpgradeResult> {
  const pwError = checkPassword(input.password)
  if (pwError) return fail('invalid', pwError)
  const account = await deps.getAccount(authId)
  if (!account) return fail('not_found', '找不到你的帐号，请重新登录')

  let displayName: string | undefined
  if (input.name !== undefined) {
    const name = checkName(input.name)
    if (!name) return fail('invalid', `名字要在 1–${NAME_MAX} 个字之间`)
    const owner = await deps.findAccount(name)
    if ((await deps.isReservedName(name)) || (owner && owner.authId !== authId)) return fail('exists', '这个名字已经被使用了，请换一个')
    displayName = name
  }
  await deps.upgradeAccount(authId, {
    password: input.password!,
    ...(account.email ? {} : { email: internalEmail(authId) }),
    ...(displayName ? { displayName } : {}),
  })
  return { ok: true, displayName: displayName ?? '' }
}

async function createAndEnter(name: string, deps: AccountDeps, opts: { password?: string; guest?: boolean }): Promise<LoginResult> {
  // 內部 email 用隨機 id，不放名字（名字可能是中文、也可能之後改）
  const email = `${crypto.randomUUID()}@users.personaai.app`
  // 先建好「已驗證」的帳號再產生登入憑證：讓 Supabase 自動建帳號時，憑證類型會變成 signup，前端換不到登入狀態
  const authId = await deps.createAccount(email, name, opts)
  await deps.ensureProfile(authId, email, name)
  const token = await deps.issueLogin(email)
  return { ok: true, displayName: name, ...token, created: true, guest: Boolean(opts.guest) }
}

/** 前端建議的隨機名字沒人用就照用；被用掉了就重抽，再不行加數字。 */
export async function uniqueRandomName(suggested: string | undefined, deps: Pick<AccountDeps, 'findAccount' | 'isReservedName' | 'random'>): Promise<string> {
  const candidates = [suggested ? cleanName(suggested) : '', ...Array.from({ length: 8 }, () => randomName(deps.random))].filter(Boolean)
  for (const name of candidates) {
    if (name.length <= NAME_MAX && !(await deps.isReservedName(name)) && !(await deps.findAccount(name))) return name
  }
  const base = candidates[candidates.length - 1] ?? '新朋友'
  for (let n = 2; n < 1000; n++) {
    const name = `${base}${n}`
    if (!(await deps.isReservedName(name)) && !(await deps.findAccount(name))) return name
  }
  throw new Error('找不到可用的随机名字')
}
