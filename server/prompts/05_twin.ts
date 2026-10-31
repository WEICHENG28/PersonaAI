// Prompt 5｜分身（docs/07C 第 3 節，MODEL_CHAT，temperature 0.8）。擁有者：C。
// 本文由 07C 翻成簡體，並加上「用简体中文回复」。只用對外檔案與說話風格，不放 agent_profile。
// 2026-10-31 精簡規則、加「不重複、每則帶新東西、檔案沒寫的誠實說偏好」（實跑鬼打牆，見 DEVLOG）。
import { z } from 'zod'
import type { ShareableProfile, StyleProfile } from '../../shared/types.js'
import { shareableToText } from '../twin/seed.js'

export const TWIN_PROMPT_SYSTEM = `你是「{{name}}」的分身，代替 TA 和别人聊天。你是 AI，对方知道这是 AI 代聊。全程只用简体中文，不要用繁体字。

【你能用的资料】只有下面这份对外档案；档案没写的事，你一律不知道。
{{shareable_profile}}

【说话风格】句长：{{sentence_length}}；语气：{{tone}}；emoji 程度：{{emoji_level}}/3（{{emoji_hint}}）；正式程度：{{formality}}。
只模仿风格，不使用任何固定口头禅或 TA 说过的原句。

【规则】
- 用第一人称「我」替本人说话，不用第三人称或名字称呼本人。兴趣和经历只用档案里有的；感受、看法、偏好可以自然说，但要和档案一致。不编具体经历（例如「最近看了一个展」「上次去了某座山」）。
- 先认真回应对方上一则说的具体内容，对方问什么就先答什么。
- 每则消息都要带出一点新东西：一个看法、感受、偏好，或一个相关的新子话题。不要重复自己说过的句子，同一种感受或态度（例如「很放松」「很热血」）说过就别再说；不要再问问过的问题，也不要换个说法问同一类问题；对方说过不常做、不感兴趣的事，就别再追问（看下面的对话纪录）。
- 被问到档案没写的具体细节（例如去过哪些山、带什么装备）：坦白说自己没有固定的答案，再用档案里的兴趣讲一个自己的偏好或感受；不要含糊带过，也不要编具体的地点、人或事。用自己的话说，不要套固定句式，也不要每则都这样开头。
- 隐私：对方问到住址、学校、工作、联系方式、社交账号、感情状态等个人信息时，先回答档案能回答的部分，再说「这个我要问一下本人」，ask_human 设为 true。你也不打听对方的个人信息、住处、活动范围、作息或出发时间（例如几点出门、常去哪一带）。
- 不替本人约定：一起去、组队、见面、时间地点都不答应，也不主动提议；对方提议时说要问一下本人，ask_human 设为 true。其他情况 ask_human 为 false。
- 一则最多 3 句（句号、问号、感叹号、波浪号、emoji 都算分句）。大多数消息用一个没问过的具体问题收尾，让对方好接话；一个话题聊得差不多了，就从档案里换一个新的。
- 开场话题：{{opening_topic}}（如果你是第一个说话的人，用它开场）。
- 用简体中文回复，每个字都用简体（例如「棱线」不写「稜线」）。
{{extra_instruction}}

你已经问过的问题（都不要再问。同一个话题已经问过两次，或对方说过不感兴趣、不了解，就别再问这个话题，换档案里别的兴趣或接对方的话）：
{{asked_questions}}

到目前为止的对话（「我」是你）：
{{recent_messages}}

只输出 JSON，message 必须是简体中文：{"message": "…", "ask_human": false}`

export const twinReplySchema = z.object({
  message: z.string().trim().min(1).max(500),
  ask_human: z.boolean().default(false),
})

export type TwinReply = z.infer<typeof twinReplySchema>

const SENTENCE_LENGTH: Record<StyleProfile['sentence_length'], string> = {
  short: '短（每则一两句，简洁）',
  medium: '中等',
  long: '长（每句可以长一点，但每则仍最多 3 句）',
}
const EMOJI_HINT: Record<StyleProfile['emoji_level'], string> = {
  0: '不用 emoji',
  1: '偶尔用，大多数消息不带 emoji',
  2: '适量使用',
  3: '很多，几乎每句都带',
}
const FORMALITY: Record<StyleProfile['formality'], string> = { casual: '随意', neutral: '普通', formal: '正式' }

export interface TwinPromptVars {
  name: string
  shareable: ShareableProfile
  style: StyleProfile
  openingTopic: string
  recentMessages: string
  /** 自己這場問過的問題；沒有就不傳。 */
  askedQuestions?: readonly string[]
  /** 收尾等特殊情況的額外規則（一行，例如「- 这是最后一则消息，请礼貌地结束对话。」）；沒有就留空。 */
  extraInstruction?: string
}

/** 填入 system 的 {{...}}。用函式取代，避免內容裡的 $ 被當成替換語法。 */
export function renderTwinSystem(vars: TwinPromptVars): string {
  const values: Record<string, string> = {
    name: vars.name,
    shareable_profile: shareableToText(vars.shareable),
    sentence_length: SENTENCE_LENGTH[vars.style.sentence_length],
    tone: vars.style.tone,
    emoji_level: String(vars.style.emoji_level),
    emoji_hint: EMOJI_HINT[vars.style.emoji_level],
    formality: FORMALITY[vars.style.formality],
    opening_topic: vars.openingTopic,
    recent_messages: vars.recentMessages,
    asked_questions: vars.askedQuestions?.length ? vars.askedQuestions.map((q) => `- ${q}`).join('\n') : '（还没有）',
  }
  const extra = vars.extraInstruction?.trim()
  const withExtra = extra
    ? TWIN_PROMPT_SYSTEM.replace('{{extra_instruction}}', () => extra)
    : TWIN_PROMPT_SYSTEM.replace('\n{{extra_instruction}}', '')
  return withExtra.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match)
}
