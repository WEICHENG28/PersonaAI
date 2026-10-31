// C9 大廳的 Supabase 實作（lobby.ts 的 LobbyStore）。擁有者：C。
// 只讀大廳要用的欄位；agent_profile（Big Five）一律不讀。
import type { Purpose, ShareableProfile } from '../../shared/types'
import { getServiceClient } from '../lib/supabase'
import type { LobbyMe, LobbyRow, LobbyStore } from './lobby'

type ProfileJoin<T> = T | T[] | null

function one<T>(value: ProfileJoin<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

/** pgvector 經 PostgREST 回傳的是字串 "[0.1,0.2,…]"。 */
export function parseVector(value: unknown): number[] | null {
  if (Array.isArray(value)) return value.map(Number)
  if (typeof value !== 'string' || !value.startsWith('[')) return null
  try {
    return (JSON.parse(value) as unknown[]).map(Number)
  } catch {
    return null
  }
}

function selfMbti(funLabels: unknown): string | null {
  const v = (funLabels as { user_mbti?: unknown } | null)?.user_mbti
  return typeof v === 'string' && v ? v : null
}

interface LobbyProfile {
  shareable_profile: ShareableProfile | null
  card: unknown
  embedding: unknown
  fun_labels: unknown
}

export function supabaseLobbyStore(): LobbyStore {
  return {
    async listLobbyUsers() {
      const { data, error } = await getServiceClient()
        .from('users')
        .select('id, display_name, purposes, user_profiles!inner(shareable_profile, shareable_confirmed, card, embedding, fun_labels)')
        .eq('social_agent_enabled', true)
        .eq('user_profiles.shareable_confirmed', true)
      if (error) throw new Error(`读取大厅失败：${error.message}`)
      return (data ?? []).flatMap((row): LobbyRow[] => {
        const profile = one(row.user_profiles as ProfileJoin<LobbyProfile>)
        if (!profile?.shareable_profile) return []
        return [
          {
            user_id: row.id as string,
            display_name: row.display_name as string,
            purposes: (row.purposes ?? []) as Purpose[],
            shareable: profile.shareable_profile,
            card: profile.card ?? null,
            embedding: parseVector(profile.embedding),
            self_mbti: selfMbti(profile.fun_labels),
          },
        ]
      })
    },

    async getMe(userId) {
      const { data, error } = await getServiceClient()
        .from('users')
        .select('social_agent_enabled, user_profiles(shareable_confirmed, embedding)')
        .eq('id', userId)
        .maybeSingle()
      if (error) throw new Error(`读取你的设置失败：${error.message}`)
      const profile = one((data?.user_profiles ?? null) as ProfileJoin<{ shareable_confirmed: boolean; embedding: unknown }>)
      const me: LobbyMe = {
        socialAgentEnabled: Boolean(data?.social_agent_enabled),
        shareableConfirmed: Boolean(profile?.shareable_confirmed),
        embedding: parseVector(profile?.embedding),
      }
      return me
    },

    async saveCard(userId, card) {
      const { error } = await getServiceClient().from('user_profiles').update({ card }).eq('user_id', userId)
      if (error) throw new Error(`保存大厅卡片失败：${error.message}`)
    },

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
