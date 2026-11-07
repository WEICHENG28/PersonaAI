import type { AuthedUser } from './auth.js'

/** 固定期限、按插入順序淘汰；讀取不延長期限或改變順序。 */
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>()
  // 失效期間仍在等待的查詢不可把舊資料重新填回。
  generation = 0

  constructor(private readonly capacity = 500, private readonly now = () => Date.now()) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: T, ttlMs: number): void {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) return
    this.entries.delete(key)
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs })
    if (this.entries.size > this.capacity) {
      this.entries.delete(this.entries.keys().next().value!)
    }
  }

  delete(key: string): void {
    this.generation++
    this.entries.delete(key)
  }

  deleteWhere(matches: (value: T) => boolean): void {
    this.generation++
    for (const [key, entry] of this.entries) {
      if (matches(entry.value)) this.entries.delete(key)
    }
  }

  clear(): void {
    this.generation++
    this.entries.clear()
  }
}

export const authUserCache = new TtlCache<AuthedUser>()
export const appUserIdCache = new TtlCache<string>()

/** 只影響本 Node/Vercel 實例；掃描最多 500 筆，清除同帳號的所有 JWT。 */
export function invalidateAuthUser(authId: string): void {
  authUserCache.deleteWhere((user) => user.authId === authId)
  appUserIdCache.delete(authId)
}

export function clearAuthCaches(): void {
  authUserCache.clear()
  appUserIdCache.clear()
}
