// C9 大廳（docs/07C C9）：卡片列表、篩選、「我自己聊」、「讓分身去聊」；C10 助手在 lobbyAssistant.ts。擁有者：C。
// 候選人與相似度來自 B 的 searchLobby（contracts/social），查詢文字用「我的興趣＋想找的人」，所以 AI 預估是「我和對方合不合」。
// 卡片內容來自 user_profiles.card；為 null（或格式不對）時用 Prompt 10 產生並快取。
// AI 預估只回文字等級（很可能合得來／可以聊聊看／差異較大），不回相似度數字、向量或對外檔案以外的資料。
import { z } from 'zod'
import type { AgentTask, LobbyCandidate, LobbyQuery, Purpose, ShareableProfile, StartConversationInput } from '../../shared/types.js'
import type { LlmJsonOptions } from '../lib/llm/index.js'
import {
  CARD_HEADLINE_CAP,
  CARD_STYLE_CAP,
  CARD_TAGS_MAX,
  CARD_TEMPERATURE,
  CARD_PROMPT_SYSTEM,
  cardUserMessage,
  lobbyCardSchema,
  type LobbyCard,
} from '../prompts/10_card.js'
import { notReadyMessage } from '../social/readiness.js'
import { ChatRoomError } from './chatRoom.js'
import { askAssistant, type AssistantView } from './lobbyAssistant.js'

export type FitLevel = 'likely' | 'maybe' | 'different'

/**
 * 門檻（2026-10-31 實測，PR #88）：用「兴趣：…；想找：…」查大廳 13 人，有共同興趣的 0.60～0.82，沒有的 0.43～0.53。
 * 用整份檔案當查詢時兩群會混在一起，所以查詢只放興趣與想找的人。
 */
export const FIT_LIKELY_MIN = 0.6
export const FIT_MAYBE_MIN = 0.5
export const LOBBY_QUERY_MAX = 30
/** 先把整個大廳排好再自己篩（searchLobby 的關鍵字只加分不篩掉，目的 friend 等於全部）。 */
export const LOBBY_POOL_LIMIT = 100

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
  /** 用名字（帳號 ID）找人：名字包含這段字就算（不分大小寫）。 */
  name: z
    .string()
    .trim()
    .max(LOBBY_QUERY_MAX)
    .optional()
    .transform((n) => n || undefined),
})

export type LobbyFilter = z.infer<typeof lobbyQuerySchema>

export const targetBodySchema = z.object({ targetUserId: z.uuid() })

/** 卡片快取、自填 MBTI 與找人目的（user_profiles.card、fun_labels.user_mbti、users.purposes）。 */
export interface CardRow {
  card: unknown
  self_mbti: string | null
  purposes: Purpose[]
}

export interface LobbyStore {
  /** 這些人的卡片快取、自填 MBTI 與目的；沒有資料的人不會出現在 Map 裡。 */
  getCardRows(userIds: string[]): Promise<Map<string, CardRow>>
  saveCard(userId: string, card: LobbyCard): Promise<void>
  /** 我開了社交 Agent、對外檔案也確認了（分身才能替我去聊）。 */
  isReadyForTwin(userId: string): Promise<boolean>
  /** 缺哪一步（給更準的提示）；沒實作就用通用說法。 */
  readinessOf?(userId: string): Promise<{ socialAgentEnabled: boolean; shareableConfirmed: boolean }>
  /** 對方在大廳裡（開了社交 Agent、對外檔案已確認）。 */
  isInLobby(userId: string): Promise<boolean>
  /** 我本人和這位分身之間還沒結束的手動對話（重複按「我自己聊」時接著聊）。 */
  findOpenManualChat(userId: string, targetUserId: string): Promise<string | null>
}

export interface LobbyDeps {
  store: LobbyStore
  searchLobby(userId: string, q: LobbyQuery): Promise<LobbyCandidate[]>
  getShareableProfile(userId: string): Promise<ShareableProfile | null>
  createTaskFromText(userId: string, text: string): Promise<AgentTask>
  createSingleTargetTask(userId: string, targetUserId: string): Promise<AgentTask>
  startConversation(input: StartConversationInput): Promise<{ conversationId: string }>
  llmJson<T>(opts: LlmJsonOptions<T>): Promise<T>
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
  /** 我還沒確認對外檔案時、以及助手附的小卡片是 null。 */
  fit: FitLevel | null
  /** 示範用戶（虛構角色）；畫面標「示范用户」，真人標「真人」。 */
  isSeed: boolean
}

export type LobbyAssistantView = AssistantView<LobbyCardView>

export interface LobbyApi {
  listLobby(userId: string, filter: LobbyFilter): Promise<LobbyCardView[]>
  ask(userId: string, question: string): Promise<LobbyAssistantView>
  startHumanChat(userId: string, targetUserId: string): Promise<{ conversationId: string }>
  startTwinChat(userId: string, targetUserId: string): Promise<{ taskId: string }>
}

export const NOT_READY_FOR_TWIN = '先到「我的档案」确认对外档案，并在设置开启社交 Agent，分身才能替你去聊'
const NOT_IN_LOBBY = '这位用户目前不在大厅里'
const NOT_SELF = '不能和自己聊天'

export function fitLevel(similarity: number): FitLevel {
  if (similarity >= FIT_LIKELY_MIN) return 'likely'
  if (similarity >= FIT_MAYBE_MIN) return 'maybe'
  return 'different'
}

/** 用自己的興趣與想找的人當查詢（一行，B 的「搜索大厅」日誌也比較好讀）。 */
export function myQueryText(me: ShareableProfile): string {
  return `兴趣：${me.interests.join('、')}；想找：${me.looking_for}`
}

/** 興趣關鍵字：雙向包含（「登山」對上「爱登山」），也看一句話介紹。 */
export function matchesQuery(profile: ShareableProfile, q: string): boolean {
  const key = q.toLowerCase()
  const hit = (s: string) => {
    const v = s.toLowerCase()
    return v.includes(key) || (v.length > 0 && key.includes(v))
  }
  return profile.interests.some(hit) || profile.intro.toLowerCase().includes(key)
}

/** 名字（帳號 ID）包含搜尋字就算，不分大小寫。 */
export function matchesName(displayName: string, name: string | undefined): boolean {
  return !name || displayName.toLowerCase().includes(name.toLowerCase())
}

/** 目的照字面比對（選「交友」只出現目的有交友的人）；關鍵字要對得上。 */
export function matchesFilter(purposes: readonly Purpose[] | undefined, profile: ShareableProfile, filter: LobbyFilter): boolean {
  if (filter.purpose && !(purposes ?? []).includes(filter.purpose)) return false
  return !filter.q || matchesQuery(profile, filter.q)
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

/** B 的 TaskError（server/social/task.ts，不能直接 import）：message 是給用戶看的，status 是 HTTP 狀態碼。 */
async function withTaskErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    if (err instanceof Error && err.name === 'TaskError') {
      const status = (err as Error & { status?: number }).status
      throw new ChatRoomError(err.message, status === 403 || status === 404 ? status : 400)
    }
    throw err
  }
}

export function createLobbyApi(deps: LobbyDeps): LobbyApi {
  /** 讀快取；沒有或格式不對就產生並存起來。產生失敗用備用卡片，不讓大廳打不開。 */
  async function cardOf(c: LobbyCandidate, row: CardRow | undefined): Promise<LobbyCard> {
    const cached = lobbyCardSchema.safeParse(row?.card)
    if (row?.card && cached.success) return cached.data
    try {
      const generated = await deps.llmJson({
        role: 'fast',
        system: CARD_PROMPT_SYSTEM,
        messages: [{ role: 'user', content: cardUserMessage(c.shareable, row?.self_mbti ?? null) }],
        temperature: CARD_TEMPERATURE,
        schema: lobbyCardSchema,
      })
      const card = keepProfileTags(generated, c.shareable)
      // 存不進快取也照樣顯示，下次打開大廳再產生一次
      await deps.store.saveCard(c.user_id, card).catch((err) => console.error('[twin] 大厅卡片快取保存失败', err))
      return card
    } catch (err) {
      console.error('[twin] 大厅卡片产生失败，先用对外档案', err)
      return fallbackCard(c.shareable)
    }
  }

  /** 候選人 → 卡片；withFit 時放 AI 預估（助手的小卡片不放）。 */
  async function toCards(found: LobbyCandidate[], withFit: boolean, known?: Map<string, CardRow>): Promise<LobbyCardView[]> {
    const rows = known ?? (await deps.store.getCardRows(found.map((c) => c.user_id)))
    return Promise.all(
      found.map(async (c): Promise<LobbyCardView> => {
        const row = rows.get(c.user_id)
        const card = await cardOf(c, row)
        return {
          userId: c.user_id,
          name: c.display_name,
          headline: card.headline,
          tags: card.tags,
          chatStyle: card.chat_style,
          // 自填 MBTI 以檔案為準（用戶可能改過），不用快取裡的
          mbti: row?.self_mbti ?? null,
          fit: withFit ? fitLevel(c.similarity) : null,
          isSeed: c.is_seed === true,
        }
      }),
    )
  }

  /** 對方要在大廳裡、而且不是自己。 */
  async function requireTarget(userId: string, targetUserId: string): Promise<void> {
    if (targetUserId === userId) throw new ChatRoomError(NOT_SELF, 400)
    if (!(await deps.store.isInLobby(targetUserId))) throw new ChatRoomError(NOT_IN_LOBBY, 404)
  }

  return {
    async listLobby(userId, filter) {
      const me = await deps.getShareableProfile(userId)
      // 我還沒有確認的檔案時，相似度不是「跟我合不合」，就不給預估
      const found = await deps.searchLobby(userId, { text: me ? myQueryText(me) : undefined, limit: LOBBY_POOL_LIMIT })
      const rows = await deps.store.getCardRows(found.map((c) => c.user_id))
      const kept = found.filter((c) => matchesName(c.display_name, filter.name) && matchesFilter(rows.get(c.user_id)?.purposes, c.shareable, filter))
      return toCards(kept, me !== null, rows)
    },

    ask: (userId, question) =>
      askAssistant(
        {
          searchLobby: deps.searchLobby,
          getShareableProfile: deps.getShareableProfile,
          createTaskFromText: deps.createTaskFromText,
          llmJson: deps.llmJson,
          toCards: (found) => toCards(found, false),
          withTaskErrors,
        },
        userId,
        question,
      ),

    async startHumanChat(userId, targetUserId) {
      await requireTarget(userId, targetUserId)
      const open = await deps.store.findOpenManualChat(userId, targetUserId)
      if (open) return { conversationId: open }
      return deps.startConversation({ aUserId: userId, bUserId: targetUserId, aController: 'human', origin: 'manual' })
    },

    async startTwinChat(userId, targetUserId) {
      await requireTarget(userId, targetUserId)
      if (!(await deps.store.isReadyForTwin(userId))) {
        // 只講缺的那一步：沒開社交 Agent 就叫他去設定開，不要叫他去我的檔案
        const r = await deps.store.readinessOf?.(userId)
        throw new ChatRoomError((r && notReadyMessage(r, '，分身才能替你去聊')) || NOT_READY_FOR_TWIN, 403)
      }
      const task = await withTaskErrors(() => deps.createSingleTargetTask(userId, targetUserId))
      return { taskId: task.id }
    },
  }
}
