/**
 * 游客帳號自動刪除：建立超過 CONFIG.GUEST_KEEP_DAYS 天、還沒設密碼的游客帳號，連同記錄一起刪掉（Peter 2026-11-05 同意）。
 * 誰來跑：Vercel Cron 每天一次（/api/cron/cleanup-guests），worker 開著時也每 6 小時跑一次。
 * 注意：有幾張表（conversations、match_attempts、agent_tasks.target_user_id）沒有設 on delete cascade，
 * 所以刪帳號前要先清掉游客參與的對話、別人任務裡指向他的欄位，不然刪帳號會失敗。
 * 和游客聊過的真人，那段聊天也會一起消失（游客本來就是體驗用）。擁有者：B。
 */
import { CONFIG } from '../lib/config.js'
import { getServiceClient } from '../lib/supabase.js'
import { invalidateAuthUser } from '../lib/authCache.js'

export interface GuestCleanupDeps {
  /** 建立時間早於 cutoff 的游客帳號（auth id）。 */
  listExpiredGuests(cutoff: Date): Promise<string[]>
  /** 刪掉一個游客帳號和他的所有記錄。 */
  deleteGuest(authId: string): Promise<void>
}

export interface CleanupResult {
  deleted: number
  failed: number
}

export function guestCutoff(now: Date, keepDays = CONFIG.GUEST_KEEP_DAYS): Date {
  return new Date(now.getTime() - keepDays * 24 * 60 * 60 * 1000)
}

/** 一個刪失敗不影響其他人；最多一次刪 limit 個，避免 Vercel 函式超時。 */
export async function cleanupGuests(deps: GuestCleanupDeps, now = new Date(), limit = 50): Promise<CleanupResult> {
  const ids = (await deps.listExpiredGuests(guestCutoff(now))).slice(0, limit)
  const result: CleanupResult = { deleted: 0, failed: 0 }
  for (const id of ids) {
    try {
      await deps.deleteGuest(id)
      result.deleted++
    } catch (err) {
      result.failed++
      console.error('[cleanup] 删除游客失败', id, err instanceof Error ? err.message : err)
    }
  }
  return result
}

type AuthUserLite = { id: string; created_at: string; app_metadata?: Record<string, unknown> }

export function isExpiredGuest(user: AuthUserLite, cutoff: Date): boolean {
  return user.app_metadata?.guest === true && user.app_metadata?.has_password !== true && new Date(user.created_at) < cutoff
}

export function supabaseGuestCleanupDeps(): GuestCleanupDeps {
  const db = getServiceClient()
  return {
    async listExpiredGuests(cutoff) {
      const out: string[] = []
      for (let page = 1; page <= 20; page++) {
        const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
        if (error) throw error
        for (const u of data.users) if (isExpiredGuest(u, cutoff)) out.push(u.id)
        if (data.users.length < 1000) break
      }
      return out
    },
    async deleteGuest(authId) {
      const { data: row, error: rowError } = await db.from('users').select('id').eq('auth_id', authId).maybeSingle()
      if (rowError) throw rowError
      const uid = row?.id as string | undefined
      if (uid) {
        const { data: convs, error: convError } = await db.from('conversations').select('id').or(`side_a.eq.${uid},side_b.eq.${uid}`)
        if (convError) throw convError
        const convIds = (convs ?? []).map((c) => c.id as string)
        const check = (r: { error: unknown }) => {
          if (r.error) throw r.error
        }
        check(await db.from('match_attempts').delete().or(`user_id.eq.${uid},target_user_id.eq.${uid}`))
        if (convIds.length) {
          check(await db.from('match_attempts').delete().in('conversation_id', convIds))
          // 別人的任務正在和游客聊：放掉這場，worker 下一步會換下一位
          check(await db.from('agent_tasks').update({ active_conversation_id: null }).in('active_conversation_id', convIds))
          check(await db.from('conversations').delete().in('id', convIds))
        }
        check(await db.from('agent_tasks').update({ target_user_id: null }).eq('target_user_id', uid))
      }
      // 刪 auth 帳號 → users 和其餘 on delete cascade 的表一起刪
      const { error } = await db.auth.admin.deleteUser(authId)
      if (error) throw error
      invalidateAuthUser(authId)
    },
  }
}
