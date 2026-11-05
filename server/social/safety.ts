/**
 * 屏蔽與檢舉（防濫用）。擁有者：B。
 * - 屏蔽：雙方從此在大廳、社交 Agent 找人裡互相看不到，也不能再開新對話；正在進行的對話直接結束。
 * - 檢舉：記下理由並自動屏蔽對方；同一個真人被 CONFIG.REPORT_HIDE_THRESHOLD 個不同的人檢舉，先從大廳隱藏（關掉社交 Agent），等管理員處理。
 * 不用 migration：記在 agent_logs（agent='guard'，action 是「屏蔽用户」「检举用户」，detail.target_user_id 是對方），取消屏蔽就刪掉那一筆。
 */
import { CONFIG } from '../lib/config.js'
import { getAdminDb } from './db.js'

export const BLOCK_ACTION = '屏蔽用户'
export const REPORT_ACTION = '检举用户'

export const REPORT_REASONS = {
  harass: '骚扰或辱骂',
  sexual: '色情或低俗内容',
  scam: '诈骗、要钱或引导转账',
  ad: '广告或拉人',
  privacy: '索要或散播个人信息',
  other: '其他',
} as const
export type ReportReason = keyof typeof REPORT_REASONS

export class SafetyError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 = 400,
  ) {
    super(message)
    this.name = 'SafetyError'
  }
}

export interface SafetyStore {
  /** 和這個人有關的屏蔽（他屏蔽的、屏蔽他的）。 */
  blockPairs(userId: string): Promise<{ blocker: string; target: string }[]>
  addBlock(blocker: string, target: string, reason: string): Promise<void>
  removeBlock(blocker: string, target: string): Promise<void>
  addReport(reporter: string, target: string, detail: { reason: ReportReason; note?: string; conversation_id?: string }): Promise<void>
  /** 檢舉過這個人的不同用戶數。 */
  reporterCount(target: string): Promise<number>
  userInfo(userId: string): Promise<{ name: string; isSeed: boolean } | null>
  /** 從大廳隱藏（關掉社交 Agent）。 */
  hideFromLobby(userId: string, reason: string): Promise<void>
  /** 結束兩人之間還沒結束的對話。 */
  endChatsBetween(a: string, b: string): Promise<void>
}

/** 和我互相屏蔽的人（雙向）。沒接資料庫時是空的。 */
export async function blockedIdsFor(userId: string, store: SafetyStore | null = defaultSafetyStore()): Promise<Set<string>> {
  if (!store) return new Set()
  const pairs = await store.blockPairs(userId)
  return new Set(pairs.map((p) => (p.blocker === userId ? p.target : p.blocker)))
}

export async function isBlockedPair(a: string, b: string, store: SafetyStore | null = defaultSafetyStore()): Promise<boolean> {
  return (await blockedIdsFor(a, store)).has(b)
}

async function requireOther(me: string, target: string, store: SafetyStore) {
  if (me === target) throw new SafetyError('不能对自己这样做')
  const info = await store.userInfo(target)
  if (!info) throw new SafetyError('找不到这位用户', 404)
  return info
}

export async function blockUser(me: string, target: string, store: SafetyStore, reason = '用户主动屏蔽'): Promise<{ name: string }> {
  const info = await requireOther(me, target, store)
  const pairs = await store.blockPairs(me)
  if (!pairs.some((p) => p.blocker === me && p.target === target)) await store.addBlock(me, target, reason)
  await store.endChatsBetween(me, target)
  return { name: info.name }
}

export async function unblockUser(me: string, target: string, store: SafetyStore): Promise<void> {
  await store.removeBlock(me, target)
}

export async function reportUser(
  me: string,
  target: string,
  input: { reason: ReportReason; note?: string; conversationId?: string },
  store: SafetyStore,
): Promise<{ name: string; hidden: boolean }> {
  const info = await requireOther(me, target, store)
  await store.addReport(me, target, { reason: input.reason, note: input.note?.slice(0, 200), conversation_id: input.conversationId })
  await blockUser(me, target, store, `检举：${REPORT_REASONS[input.reason]}`)
  // 示範用戶是 AI 扮演的，不自動隱藏；真人被多人檢舉就先隱藏
  let hidden = false
  if (!info.isSeed && (await store.reporterCount(target)) >= CONFIG.REPORT_HIDE_THRESHOLD) {
    await store.hideFromLobby(target, `被 ${CONFIG.REPORT_HIDE_THRESHOLD} 位以上用户检举，先从大厅隐藏，等管理员处理`)
    hidden = true
  }
  return { name: info.name, hidden }
}

/** 我屏蔽的人（設定頁列表用）。 */
export async function listMyBlocks(me: string, store: SafetyStore): Promise<{ userId: string; name: string }[]> {
  const pairs = (await store.blockPairs(me)).filter((p) => p.blocker === me)
  const out: { userId: string; name: string }[] = []
  for (const p of pairs) out.push({ userId: p.target, name: (await store.userInfo(p.target))?.name ?? '已删除的用户' })
  return out
}

export function defaultSafetyStore(): SafetyStore | null {
  const db = getAdminDb()
  if (!db) return null
  const check = (r: { error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message)
  }
  return {
    async blockPairs(userId) {
      const [mine, theirs] = await Promise.all([
        db.from('agent_logs').select('user_id, detail').eq('agent', 'guard').eq('action', BLOCK_ACTION).eq('user_id', userId),
        db.from('agent_logs').select('user_id, detail').eq('agent', 'guard').eq('action', BLOCK_ACTION).eq('detail->>target_user_id', userId),
      ])
      check(mine)
      check(theirs)
      return [...(mine.data ?? []), ...(theirs.data ?? [])].flatMap((r) => {
        const target = (r.detail as { target_user_id?: string } | null)?.target_user_id
        return target ? [{ blocker: r.user_id as string, target }] : []
      })
    },
    async addBlock(blocker, target, reason) {
      check(await db.from('agent_logs').insert({ user_id: blocker, agent: 'guard', action: BLOCK_ACTION, reason, detail: { target_user_id: target } }))
    },
    async removeBlock(blocker, target) {
      check(await db.from('agent_logs').delete().eq('agent', 'guard').eq('action', BLOCK_ACTION).eq('user_id', blocker).eq('detail->>target_user_id', target))
    },
    async addReport(reporter, target, detail) {
      check(
        await db.from('agent_logs').insert({
          user_id: reporter,
          agent: 'guard',
          action: REPORT_ACTION,
          reason: REPORT_REASONS[detail.reason],
          conversation_id: detail.conversation_id ?? null,
          detail: { target_user_id: target, ...detail },
        }),
      )
    },
    async reporterCount(target) {
      const r = await db.from('agent_logs').select('user_id').eq('agent', 'guard').eq('action', REPORT_ACTION).eq('detail->>target_user_id', target)
      check(r)
      return new Set((r.data ?? []).map((x) => x.user_id as string)).size
    },
    async userInfo(userId) {
      const r = await db.from('users').select('display_name, is_seed').eq('id', userId).maybeSingle()
      check(r)
      return r.data ? { name: r.data.display_name as string, isSeed: r.data.is_seed === true } : null
    },
    async hideFromLobby(userId, reason) {
      check(await db.from('users').update({ social_agent_enabled: false }).eq('id', userId))
      check(await db.from('agent_logs').insert({ user_id: userId, agent: 'guard', action: '从大厅隐藏', reason }))
    },
    async endChatsBetween(a, b) {
      const r = await db.from('conversations').select('id').neq('status', 'ended').or(`and(side_a.eq.${a},side_b.eq.${b}),and(side_a.eq.${b},side_b.eq.${a})`)
      check(r)
      const ids = (r.data ?? []).map((x) => x.id as string)
      if (!ids.length) return
      check(await db.from('conversations').update({ status: 'ended', ended_at: new Date().toISOString() }).in('id', ids))
      // 社交 Agent 正在用這場：放掉，下一步換下一位
      check(await db.from('agent_tasks').update({ active_conversation_id: null }).in('active_conversation_id', ids))
    },
  }
}
