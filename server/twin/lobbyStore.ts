// C9 大廳的 Supabase 實作（lobby.ts 的 LobbyStore）。擁有者：C。
// 候選人與排序來自 B 的 searchLobby；這裡只讀卡片快取、自填 MBTI、目的與開關。agent_profile（Big Five）一律不讀。
import type { Purpose } from '../../shared/types.js'
import { getServiceClient } from '../lib/supabase.js'
import type { CardRow, LobbyStore } from './lobby.js'

type Join<T> = T | T[] | null

function one<T>(value: Join<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function selfMbti(funLabels: unknown): string | null {
  const v = (funLabels as { user_mbti?: unknown } | null)?.user_mbti
  return typeof v === 'string' && v ? v : null
}

interface ReadyRow {
  social_agent_enabled: boolean
  user_profiles: Join<{ shareable_confirmed: boolean }>
}

/** 開了社交 Agent、對外檔案也確認了。 */
async function isReady(userId: string): Promise<boolean> {
  const { data, error } = await getServiceClient()
    .from('users')
    .select('social_agent_enabled, user_profiles(shareable_confirmed)')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw new Error(`读取用户设置失败：${error.message}`)
  const row = data as ReadyRow | null
  return Boolean(row?.social_agent_enabled && one(row.user_profiles)?.shareable_confirmed)
}

export function supabaseLobbyStore(): LobbyStore {
  return {
    async getCardRows(userIds) {
      const rows = new Map<string, CardRow>()
      if (userIds.length === 0) return rows
      const { data, error } = await getServiceClient()
        .from('users')
        .select('id, purposes, user_profiles(card, fun_labels)')
        .in('id', userIds)
      if (error) throw new Error(`读取大厅卡片失败：${error.message}`)
      for (const r of data ?? []) {
        const profile = one(r.user_profiles as Join<{ card: unknown; fun_labels: unknown }>)
        rows.set(r.id as string, {
          card: profile?.card ?? null,
          self_mbti: selfMbti(profile?.fun_labels),
          purposes: (r.purposes ?? []) as Purpose[],
        })
      }
      return rows
    },

    async saveCard(userId, card) {
      const { error } = await getServiceClient().from('user_profiles').update({ card }).eq('user_id', userId)
      if (error) throw new Error(`保存大厅卡片失败：${error.message}`)
    },

    isReadyForTwin: isReady,
    // 大廳的條件和「能讓分身代聊」一樣：開了社交 Agent、對外檔案已確認
    isInLobby: isReady,

    async findOpenManualChat(userId, targetUserId) {
      const { data, error } = await getServiceClient()
        .from('conversations')
        .select('id')
        .eq('side_a', userId)
        .eq('side_b', targetUserId)
        .eq('origin', 'manual')
        .eq('side_a_controller', 'human')
        .neq('status', 'ended')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(`读取对话失败：${error.message}`)
      return (data?.id as string | undefined) ?? null
    },
  }
}
