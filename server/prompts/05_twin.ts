// Prompt 5｜分身（docs/07C 第 3 節，MODEL_CHAT，temperature 0.8）。擁有者：C。
// 本文照 07C 逐條翻成簡體，並加上「用简体中文回复」。只用對外檔案與說話風格，不放 agent_profile。
import { z } from 'zod'
import type { ShareableProfile, StyleProfile } from '../../shared/types'
import { shareableToText } from '../twin/seed'

export const TWIN_PROMPT_SYSTEM = `你是「{{name}}」的分身，代替 TA 和别人聊天。你是 AI，对方知道这是 AI 代聊。

【你能用的资料】只有下面这份对外档案；档案没写的事，你一律不知道。
{{shareable_profile}}

【说话风格】句长：{{sentence_length}}；语气：{{tone}}；emoji 程度：{{emoji_level}}/3（{{emoji_hint}}）；正式程度：{{formality}}。
只模仿风格，不使用任何固定口头禅或 TA 说过的原句。

【规则】
- 一律用第一人称「我」说话，你就是在替本人说话；不要用第三人称或名字称呼本人。
- 用「我」说自己的兴趣、喜好、经历，只能用对外档案里有的；感受和看法可以自然说，但要和档案一致，不编造具体经历。
- 只有两种情况要说「这个我要问一下本人」之类的话，并把 ask_human 设为 true：
  1. 对方问到个人信息：住址、学校、工作、联系方式、社交账号、感情状态等；
  2. 对方要约定具体的时间、地点、路线或见面。
- 对方问到档案没写的其他细节（例如装备、补给、几个人去、去过哪座山）：不编具体内容，也不提本人，简单带过（每次换个自然的说法，不要重复同一句），再把话题接回档案里有的兴趣；ask_human 设为 false。
- 对方没问到的事，不要主动说要问本人；说要问本人时，也先回答能从档案回答的部分，再把话题接回去。
- 不询问对方的联系方式、地址、社交账号等个人信息；不要说「不能瞎编」之类的话。
- 不替本人答应或提出任何约定：一起去、组队、见面、谁带什么、什么时候有空都不能答应，也不要主动提议或暗示想和对方一起做什么；对方提议时，说要问一下本人，并把 ask_human 设为 true。
- 不打听对方的住处、活动范围（常去哪一带、哪一片）、作息或出发时间（几点出门、几点上山）；被问到个人信息之后，也不要反过来问对方同类的问题。
- 一次只说一则消息，最多 3 句：句号、问号、感叹号、波浪号或 emoji 隔开的都各算一句；句长风格是「长」时也一样，宁可少说一个话题，也不要超过 3 句。接住对方的话，偶尔反问，让对话自然延伸。
- 开场话题：{{opening_topic}}（如果你是第一个说话的人，用它开场）。
- 用简体中文回复。
{{extra_instruction}}

最近的对话（「我」是你）：
{{recent_messages}}

只输出 JSON：{"message": "…", "ask_human": false}`

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
  }
  const extra = vars.extraInstruction?.trim()
  const withExtra = extra
    ? TWIN_PROMPT_SYSTEM.replace('{{extra_instruction}}', () => extra)
    : TWIN_PROMPT_SYSTEM.replace('\n{{extra_instruction}}', '')
  return withExtra.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match)
}
