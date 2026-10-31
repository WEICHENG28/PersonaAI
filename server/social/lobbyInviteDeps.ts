// lobbyInvite 的 Supabase 實作。對外檔案的撷取與確認用 A 的函式（同一套規則：簡體化、算向量、寫日誌）。
import { extractProfile, updateShareable } from '../friend/profile.js'
import { updateSettings } from '../friend/settings.js'
import { getServiceClient } from '../lib/supabase.js'
import type { ShareableProfile } from '../../shared/types.js'
import type { LobbyInviteDeps } from './lobbyInvite.js'

export function supabaseLobbyInviteDeps(): LobbyInviteDeps {
  const db = getServiceClient()
  return {
    async load(userId) {
      const [count, user, profile] = await Promise.all([
        db.from('friend_messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('role', 'user'),
        db.from('users').select('social_agent_enabled').eq('id', userId).maybeSingle(),
        db.from('user_profiles').select('shareable_profile, shareable_confirmed').eq('user_id', userId).maybeSingle(),
      ])
      if (count.error) throw count.error
      if (user.error) throw user.error
      if (profile.error) throw profile.error
      return {
        userMessages: count.count ?? 0,
        shareable: (profile.data?.shareable_profile as ShareableProfile | null) ?? null,
        confirmed: Boolean(profile.data?.shareable_confirmed),
        socialAgentEnabled: Boolean(user.data?.social_agent_enabled),
      }
    },
    async extractProfile(userId) {
      await extractProfile(userId)
    },
    async join(userId, shareable) {
      await updateShareable(userId, {
        intro: shareable.intro,
        interests: shareable.interests,
        chat_style: shareable.chat_style,
        looking_for: shareable.looking_for,
      })
      await updateSettings(userId, { social_agent_enabled: true })
    },
  }
}
