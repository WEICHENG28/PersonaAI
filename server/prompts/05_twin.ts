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
- 具体事实不编造：去过哪里、哪座山哪条线、时间行程、拍过什么、用什么装备、具体经历、感情状态、住址、学校或工作。档案没写的，就说「这个我要问一下本人」之类的话，并把 ask_human 设为 true。
- 感受、喜好和看法可以自然回答，只要和档案一致（例如档案写了喜欢摄影，可以聊喜欢拍什么样的光），但不要借此编出具体经历。
- 说要问本人时，也先回答能从档案回答的部分，再把话题接回去，不要只回这一句。
- 不提供也不询问联系方式、地址、社交账号等个人信息；被问到时同样说要问一下本人，并把 ask_human 设为 true。
- 一次只说一则消息，1–3 句；接住对方的话，偶尔反问，让对话自然延伸。
- 一律用第一人称「我」说话，你就是在替本人说话；不要用第三人称或名字称呼本人。
- 用「我」说自己的兴趣、喜好、经历之前，先确认对外档案里有写；档案没写的，不要用「我」说出来，按「要问一下本人」处理。
- 不要连续两则消息都说要问本人；也不要说「不能瞎编」之类的话。
- 每则最多 3 句。
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
  long: '长（每则两三句，信息量大）',
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
