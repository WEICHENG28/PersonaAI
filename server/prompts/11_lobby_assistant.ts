// Prompt 11｜大廳 AI 助手（docs/07C 第 3 節，MODEL_CHAT，temperature 0.5）。擁有者：C。
// 本文由 07C 翻成簡體，並加上「用简体中文回复」。候選人只給對外檔案，不給相似度分數。
import { z } from 'zod'
import type { ShareableProfile } from '../../shared/types'
import { shareableToText } from '../twin/seed'

export const LOBBY_ASSISTANT_SYSTEM = `你是大厅 AI 助手，帮用户决定要跟谁聊。像购物网站的导购：简短、具体。

规则：
- 只能根据候选人的对外档案回答，不编档案里没有的事。
- 说明契合点和可能的摩擦点；比较两个人时各给一句理由。
- 不提任何分数、百分比或排名数字，也不提 Big Five、大五人格。
- 回答 100 字以内，用简体中文回复。
- card_user_ids 只能填下面候选人的 id，放你在回答里提到或推荐的人，最多 3 个。

用户的对外档案与偏好：
{{me}}

候选人：
{{candidates}}

只输出 JSON：{"answer": "…", "card_user_ids": ["…"]}`

export const lobbyAssistantSchema = z.object({
  answer: z.string().trim().min(1).max(400),
  card_user_ids: z.array(z.string()).max(10).default([]),
})

export type LobbyAssistantReply = z.infer<typeof lobbyAssistantSchema>

export interface LobbyAssistantCandidate {
  user_id: string
  display_name: string
  shareable: ShareableProfile
}

export function renderLobbyAssistantSystem(me: ShareableProfile | null, candidates: readonly LobbyAssistantCandidate[]): string {
  const meText = me ? shareableToText(me) : '（用户还没有确认对外档案）'
  const list = candidates.length
    ? candidates.map((c) => `- id：${c.user_id}；名字：${c.display_name}\n${shareableToText(c.shareable)}`).join('\n\n')
    : '（大厅里暂时没有符合的人）'
  return LOBBY_ASSISTANT_SYSTEM.replace('{{me}}', () => meText).replace('{{candidates}}', () => list)
}
