// 帳號（http 模式）：註冊、登入、游客、設定密碼。後端驗證後回一次性憑證，這裡換成 Supabase 登入狀態。
// 擁有者：A（登入），由 B 的 AI 依 Peter 需求撰寫。
import { supabase } from '../supabase'

const LAST_NAME_KEY = 'personaai:lastName'
/** 這個瀏覽器上次用的游客名字（游客分頁預填，打同名就回到原游客帳號）。 */
const LAST_GUEST_KEY = 'personaai:lastGuestName'

/** 游客帳號保留幾天（和後端 CONFIG.GUEST_KEEP_DAYS 一樣；改的話兩邊一起改）。 */
export const GUEST_KEEP_DAYS = 3

export interface AccountStatus {
  guest: boolean
  hasPassword: boolean
}

/** 這個瀏覽器上次登入用的名字（登入頁自動填入）。讀不到就回 null。 */
export function lastUsedName(): string | null {
  try {
    return localStorage.getItem(LAST_NAME_KEY)
  } catch {
    return null
  }
}

export function lastGuestName(): string | null {
  try {
    return localStorage.getItem(LAST_GUEST_KEY)
  } catch {
    return null
  }
}

function rememberGuestName(name: string): void {
  try {
    localStorage.setItem(LAST_GUEST_KEY, name)
  } catch {
    /* 存不了不影響 */
  }
}

function rememberName(name: string): void {
  try {
    localStorage.setItem(LAST_NAME_KEY, name)
  } catch {
    /* 無痕模式等存不了，不影響登入 */
  }
}

type LoginData = { displayName: string; tokenHash: string; verificationType?: string; created: boolean; guest: boolean }
type ApiJson<T> = { ok: true; data: T } | { ok: false; code?: string; error?: string } | null

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('连不上服务器，请稍后再试')
  }
  const json = (await res.json().catch(() => null)) as ApiJson<T>
  if (!json?.ok) throw new Error(json?.error ?? '出了点问题，再试一次？')
  return json.data
}

async function signIn(data: LoginData): Promise<{ displayName: string; created: boolean; guest: boolean }> {
  // 憑證類型照後端回的（signup／magiclink），不然 Supabase 會拒絕
  const type = data.verificationType === 'signup' ? 'signup' : 'magiclink'
  const { error } = await supabase.auth.verifyOtp({ token_hash: data.tokenHash, type })
  if (error) {
    console.error('[account] verifyOtp failed', error.message)
    throw new Error('登录失败，请再试一次')
  }
  if (data.guest) rememberGuestName(data.displayName)
  else rememberName(data.displayName)
  return { displayName: data.displayName, created: data.created, guest: data.guest }
}

export async function registerAccount(name: string, password: string) {
  return signIn(await post<LoginData>('/api/account/register', { name, password }))
}

export async function loginAccount(name: string, password: string) {
  return signIn(await post<LoginData>('/api/account/login', { name, password }))
}

/** 游客体验：不用密碼，自己取名字或用隨機名字（random=true 時後端保證不重複）。 */
export async function enterAsGuest(name: string, random: boolean) {
  return signIn(await post<LoginData>('/api/account/guest', { name, random }))
}

/** 設定／修改密碼（游客可順便換名字）。成功後刷新登入狀態，畫面上的帳號狀態才會更新。 */
export async function setAccountPassword(password: string, name?: string): Promise<{ displayName: string }> {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  if (!token) throw new Error('请先登录')
  const data = await post<{ displayName: string }>('/api/account/password', { password, ...(name !== undefined ? { name } : {}) }, token)
  await supabase.auth.refreshSession().catch(() => {})
  rememberName(data.displayName)
  return data
}

/** 目前帳號是游客嗎、設過密碼了嗎（讀登入狀態裡的 app_metadata）。 */
export async function accountStatus(): Promise<AccountStatus | null> {
  const { data } = await supabase.auth.getUser()
  const meta = data.user?.app_metadata
  if (!data.user) return null
  return { guest: meta?.guest === true, hasPassword: meta?.has_password === true }
}
