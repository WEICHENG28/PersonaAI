// C9 大廳（docs/07C C9）：卡片列表、篩選、「我自己聊」、「讓分身去聊」。擁有者：C。
// 卡片內容來自 user_profiles.card；為 null（或格式不對）時用 Prompt 10 產生並快取。
// AI 預估只回文字等級（很可能合得來／可以聊聊看／差異較大），不回相似度數字、向量或對外檔案以外的資料。
import { z } from 'zod'
import type { AgentTask, Purpose, ShareableProfile, StartConversationInput } from '../../shared/types'
import type { LlmJsonOptions } from '../lib/llm'
import {
  CARD_HEADLINE_CAP,
  CARD_STYLE_CAP,
  CARD_TAGS_MAX,
  CARD_TEMPERATURE,
  CARD_PROMPT_SYSTEM,
  cardUserMessage,
  lobbyCardSchema,
  type LobbyCard,
} from '../prompts/10_card'
import { ChatRoomError } from './chatRoom'

export type FitLevel = 'likely' | 'maybe' | 'different'

/** 相似度門檻：2026-10-31 實測大廳 29 位有向量的用戶，配對相似度 0.44～0.92、中位數 0.66。 */
export const FIT_LIKELY_MIN = 0.65
export const FIT_MAYBE_MIN = 0.55
export const LOBBY_QUERY_MAX = 30

export const purposeSchema = z.enum(['friend', 'study', 'sport', 'hobby'])

export const lobbyQuerySchema = z.object({
  purpose: z
    .union([purposeSchema, z.literal('')])
    .optional()
    .transform((p) => p || undefined),
  q: z
    .string()
    .trim()
    .max(LOBBY_QUERY_MAX)
    .optional()
    .transform((q) => q || undefined),
})

export type LobbyFilter = z.infer<typeof lobbyQuerySchema>

export const targetBodySchema = z.object({ targetUserId: z.uuid() })

/** 大廳裡的一位用戶（已開社交 Agent、已確認對外檔案）。 */
export interface LobbyRow {
  user_id: string
  display_name: string
  purposes: Purpose[]
  shareable: ShareableProfile
  card: unknown
  embedding: number[] | null
  self_mbti: string | null
}

export interface LobbyMe {
  socialAgentEnabled: boolean
  shareableConfirmed: boolean
  embedding: number[] | null
}

export interface LobbyStore {
  listLobbyUsers(): Promise<LobbyRow[]>
  getMe(userId: string): Promise<LobbyMe>
  saveCard(userId: string, card: LobbyCard): Promise<void>
  /** 我本人和這位分身之間還沒結束的手動對話（重複按「我自己聊」時接著聊）。 */
  findOpenManualChat(userId: string, targetUserId: string): Promise<string | null>
}

export interface LobbyDeps {
  store: LobbyStore
  llmJson<T>(opts: LlmJsonOptions<T>): Promise<T>
  startConversation(input: StartConversationInput): Promise<{ conversationId: string }>
  createSingleTargetTask(userId: string, targetUserId: string): Promise<AgentTask>
}

/** 給畫面的一張卡片：沒有任何分數。 */
export interface LobbyCardView {
  userId: string
  name: string
  headline: string
  tags: string[]
  chatStyle: string
  /** 自填才有，畫面要標「仅供娱乐」。 */
  mbti: string | null
  purposes: Purpose[]
  /** 我還沒有向量（檔案沒確認）或對方沒有向量時是 null。 */
  fit: FitLevel | null
}

export interface LobbyApi {
  listLobby(userId: string, filter: LobbyFilter): Promise<LobbyCardView[]>
  startHumanChat(userId: string, targetUserId: string): Promise<{ conversationId: string }>
  startTwinChat(userId: string, targetUserId: string): Promise<{ taskId: string }>
}

export const NOT_READY_FOR_TWIN = '先到「我的档案」确认对外档案，并在设置开启社交 Agent，分身才能替你去聊'
const NOT_IN_LOBBY = '这位用户目前不在大厅里'
const NOT_SELF = '不能和自己聊天'

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! ** 2
    nb += b[i]! ** 2
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

export function fitLevel(similarity: number): FitLevel {
  if (similarity >= FIT_LIKELY_MIN) return 'likely'
  if (similarity >= FIT_MAYBE_MIN) return 'maybe'
  return 'different'
}

/** 興趣關鍵字：雙向包含（「登山」對上「爱登山」），也看一句話介紹。 */
export function matchesQuery(row: LobbyRow, q: string): boolean {
  const key = q.toLowerCase()
  const hit = (s: string) => {
    const v = s.toLowerCase()
    return v.includes(key) || (v.length > 0 && key.includes(v))
  }
  return row.shareable.interests.some(hit) || row.shareable.intro.toLowerCase().includes(key)
}

export function matchesFilter(row: LobbyRow, filter: LobbyFilter): boolean {
  if (filter.purpose && !row.purposes.includes(filter.purpose)) return false
  return !filter.q || matchesQuery(row, filter.q)
}

/** LLM 失敗時的備用卡片：直接用對外檔案（不快取，下次再試）。 */
export function fallbackCard(profile: ShareableProfile): LobbyCard {
  return {
    headline: profile.intro.slice(0, CARD_HEADLINE_CAP),
    tags: profile.interests.slice(0, CARD_TAGS_MAX),
    chat_style: profile.chat_style.slice(0, CARD_STYLE_CAP),
    mbti: null,
  }
}

/** 標籤只留檔案裡真的有的興趣；LLM 一個都沒對上就直接用檔案的興趣。 */
export function keepProfileTags(card: LobbyCard, profile: ShareableProfile): LobbyCard {
  const inProfile = card.tags.filter((t) => profile.interests.some((i) => i.includes(t) || t.includes(i)))
  return { ...card, tags: inProfile.length > 0 ? inProfile : profile.interests.slice(0, CARD_TAGS_MAX) }
}

export function createLobbyApi(deps: LobbyDeps): LobbyApi {
  /** 讀快取；沒有或格式不對就產生並存起來。產生失敗用備用卡片，不讓大廳打不開。 */
  async function cardOf(row: LobbyRow): Promise<LobbyCard> {
    const cached = lobbyCardSchema.safeParse(row.card)
    if (row.card && cached.success) return cached.data
    try {
      const generated = await deps.llmJson({
        role: 'fast',
        system: CARD_PROMPT_SYSTEM,
        messages: [{ role: 'user', content: cardUserMessage(row.shareable, row.self_mbti) }],
        temperature: CARD_TEMPERATURE,
        schema: lobbyCardSchema,
      })
      const card = keepProfileTags(generated, row.shareable)
      // 存不進快取也照樣顯示，下次打開大廳再產生一次
      await deps.store.saveCard(row.user_id, card).catch((err) => console.error('[twin] 大厅卡片快取保存失败', err))
      return card
    } catch (err) {
      console.error('[twin] 大厅卡片产生失败，先用对外档案', err)
      return fallbackCard(row.shareable)
    }
  }

  /** 對方要在大廳裡、而且不是自己。 */
  async function requireTarget(userId: string, targetUserId: string): Promise<LobbyRow> {
    if (targetUserId === userId) throw new ChatRoomError(NOT_SELF, 400)
    const target = (await deps.store.listLobbyUsers()).find((r) => r.user_id === targetUserId)
    if (!target) throw new ChatRoomError(NOT_IN_LOBBY, 404)
    return target
  }

  return {
    async listLobby(userId, filter) {
      const [rows, me] = await Promise.all([deps.store.listLobbyUsers(), deps.store.getMe(userId)])
      const ranked = rows
        .filter((r) => r.user_id !== userId && matchesFilter(r, filter))
        .map((row) => ({
          row,
          similarity: me.embedding && row.embedding ? cosineSimilarity(me.embedding, row.embedding) : null,
        }))
        .sort((a, b) => (b.similarity ?? -1) - (a.similarity ?? -1))
      return Promise.all(
        ranked.map(async ({ row, similarity }): Promise<LobbyCardView> => {
          const card = await cardOf(row)
          return {
            userId: row.user_id,
            name: row.display_name,
            headline: card.headline,
            tags: card.tags,
            chatStyle: card.chat_style,
            // 自填 MBTI 以檔案為準（用戶可能改過），不用快取裡的
            mbti: row.self_mbti,
            purposes: row.purposes,
            fit: similarity === null ? null : fitLevel(similarity),
          }
        }),
      )
    },

    async startHumanChat(userId, targetUserId) {
      await requireTarget(userId, targetUserId)
      const open = await deps.store.findOpenManualChat(userId, targetUserId)
      if (open) return { conversationId: open }
      return deps.startConversation({ aUserId: userId, bUserId: targetUserId, aController: 'human', origin: 'manual' })
    },

    async startTwinChat(userId, targetUserId) {
      await requireTarget(userId, targetUserId)
      const me = await deps.store.getMe(userId)
      if (!me.socialAgentEnabled || !me.shareableConfirmed) throw new ChatRoomError(NOT_READY_FOR_TWIN, 403)
      const task = await deps.createSingleTargetTask(userId, targetUserId)
      return { taskId: task.id }
    },
  }
}
