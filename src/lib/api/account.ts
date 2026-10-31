// 名字帳號登入（http 模式）：後端建立或找到帳號，回一次性憑證，這裡換成 Supabase 登入狀態。
// 擁有者：A（登入），由 B 的 AI 依 Peter 需求撰寫。
import { supabase } from '../supabase'

export type EnterMode = 'name' | 'random'

/** 名字已有帳號時丟出，前端問用戶「是你嗎」。 */
export class NameExistsError extends Error {
  constructor(
    message: string,
    readonly displayName: string,
  ) {
    super(message)
    this.name = 'NameExistsError'
  }
}

const LAST_NAME_KEY = 'personaai:lastName'

/** 這個瀏覽器上次登入用的名字（登入頁自動填入）。讀不到就回 null。 */
export function lastUsedName(): string | null {
  try {
    return localStorage.getItem(LAST_NAME_KEY)
  } catch {
    return null
  }
}

function rememberName(name: string): void {
  try {
    localStorage.setItem(LAST_NAME_KEY, name)
  } catch {
    /* 無痕模式等存不了，不影響登入 */
  }
}

export async function enterWithName(mode: EnterMode, name: string, confirmExisting = false): Promise<{ displayName: string; created: boolean }> {
  let res: Response
  try {
    res = await fetch('/api/account/enter', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode, name, confirmExisting }),
    })
  } catch {
    throw new Error('连不上服务器，请稍后再试')
  }
  const json = (await res.json().catch(() => null)) as
    | { ok: true; data: { displayName: string; tokenHash: string; verificationType?: string; created: boolean } }
    | { ok: false; code?: string; error?: string; displayName?: string }
    | null
  if (!json?.ok) {
    if (json?.code === 'exists') throw new NameExistsError(json.error ?? '这个名字已经有帐号了', json.displayName ?? name)
    throw new Error(json?.error ?? '出了点问题，再试一次？')
  }
  // 憑證類型照後端回的（signup／magiclink），不然 Supabase 會拒絕
  const type = json.data.verificationType === 'signup' ? 'signup' : 'magiclink'
  const { error } = await supabase.auth.verifyOtp({ token_hash: json.data.tokenHash, type })
  if (error) {
    console.error('[account] verifyOtp failed', error.message)
    throw new Error('登录失败，请再试一次')
  }
  rememberName(json.data.displayName)
  return { displayName: json.data.displayName, created: json.data.created }
}
