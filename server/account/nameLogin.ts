// 只用名字的帳號（Peter 2026-10-31 決定）：同一個名字下次再輸入就回到同一個帳號；
// 名字已有帳號時先提示，用戶確認「是我」才進入；隨機名字一定不和現有帳號重複。
// 安全取捨：沒有密碼，任何人輸入你的名字都能進你的帳號，只適合 Demo（見 DEVLOG）。
// 擁有者：A（登入），由 B 的 AI 依 Peter 需求撰寫。
import { randomName } from '../../src/features/friend/randomName.js'

export const NAME_MAX = 20

export interface ExistingAccount {
  authId: string
  /** 帳號原本有沒有 email（舊的匿名帳號沒有，登入前要補一個內部 email） */
  email: string | null
}

export interface NameLoginDeps {
  /** 非種子用戶裡叫這個名字的帳號（同名有多個時取最新的）。 */
  findAccount(name: string): Promise<ExistingAccount | null>
  /** 種子用戶的名字保留，不能拿來註冊或登入。 */
  isReservedName(name: string): Promise<boolean>
  /** 幫舊帳號補上內部 email（只用來產生登入連結，不會寄信）。 */
  setEmail(authId: string, email: string): Promise<void>
  /** 建立已驗證的新帳號（不寄信），回傳 auth id。 */
  createAccount(email: string, displayName: string): Promise<string>
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

export type NameLoginResult =
  | { ok: true; displayName: string; tokenHash: string; verificationType: string; created: boolean }
  | { ok: false; code: 'invalid' | 'reserved' | 'exists'; error: string; displayName?: string }

/** 舊的匿名帳號補 email 用：不寄信、不給人看，只是 Supabase 登入需要一個 email。 */
export function internalEmail(authId: string): string {
  return `${authId}@users.personaai.app`
}

export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

/**
 * mode = 'name'：用輸入的名字。名字已有帳號且 confirmExisting 不是 true → 回 exists 讓前端問「是你嗎」。
 * mode = 'random'：用（或產生）一個沒人用過的隨機名字，建立新帳號。
 */
export async function nameLogin(
  input: { mode: 'name' | 'random'; name?: string; confirmExisting?: boolean },
  deps: NameLoginDeps,
): Promise<NameLoginResult> {
  if (input.mode === 'random') return enterNew(await uniqueRandomName(input.name, deps), deps)

  const name = cleanName(input.name ?? '')
  if (!name || name.length > NAME_MAX) return { ok: false, code: 'invalid', error: `名字要在 1–${NAME_MAX} 个字之间` }
  if (await deps.isReservedName(name)) return { ok: false, code: 'reserved', error: '这个名字已经被使用了，请换一个' }

  const existing = await deps.findAccount(name)
  if (!existing) return enterNew(name, deps)
  if (!input.confirmExisting) {
    return { ok: false, code: 'exists', displayName: name, error: `「${name}」已经有帐号了。是你的话可以直接进入，之前的记录都会在；不是的话请换一个名字。` }
  }

  const email = existing.email ?? internalEmail(existing.authId)
  if (!existing.email) await deps.setEmail(existing.authId, email)
  const token = await deps.issueLogin(email)
  return { ok: true, displayName: name, ...token, created: false }
}

async function enterNew(name: string, deps: NameLoginDeps): Promise<NameLoginResult> {
  // 內部 email 用隨機 id，不放名字（名字可能是中文、也可能之後改）
  const email = `${crypto.randomUUID()}@users.personaai.app`
  // 先建好「已驗證」的帳號再產生登入憑證：讓 Supabase 自動建帳號時，憑證類型會變成 signup，前端換不到登入狀態
  const authId = await deps.createAccount(email, name)
  await deps.ensureProfile(authId, email, name)
  const token = await deps.issueLogin(email)
  return { ok: true, displayName: name, ...token, created: true }
}

/** 前端建議的隨機名字沒人用就照用；被用掉了就重抽，再不行加數字。 */
export async function uniqueRandomName(suggested: string | undefined, deps: NameLoginDeps): Promise<string> {
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
