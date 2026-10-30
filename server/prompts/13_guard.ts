// Prompt 13｜隱私守門（docs/07C 第 3 節，MODEL_FAST，temperature 0）。擁有者：C。
// 本文照 07C 翻成簡體，並加上「用简体中文回复」；另外說明「（已隐藏）」是規則已經遮掉的內容。
import { z } from 'zod'
import type { ShareableProfile } from '../../shared/types'
import { shareableToText } from '../twin/seed'

export const GUARD_PROMPT_SYSTEM = `你是隐私守门 Agent。检查分身准备发出的消息有没有泄露隐私。

可以说：对外档案里有的内容。
不可以说：身份信息、电话、邮箱、社交账号、地址、学校或公司名称、具体地点与时间行程、健康、感情或家庭私事、别人的私事、对外档案没有提到的具体事件。
「（已隐藏）」是已经遮掉的内容，不算泄露，改写时也原样保留、不要换成别的词；只剩「（已隐藏）」、没有别的问题时，回 ok = true。
判断方法：先看消息里有没有专有名称（学校、公司、小区、街道、商圈、景点入口等有名字的地方）、号码账号、具体日期或几点、或私事。
- 都没有 → ok = true，不要改写。笼统的说法都不算泄露，例如「我住在山上很安静」「在郊区」「在市区」「海边」「在读研究生」「周末去爬山」。
- 有 → 才算泄露。具体日期或几点加上地点、集合点，算时间行程，时间和地点都要去掉。

如果有，改写成不泄露的版本：只把泄露的部分换成笼统说法或删掉，其他内容、语气和意思都保留（例如「我在清华读研二」改成「我在读研究生」，「周六早上 7 点在香山东门集合」改成「周末打算去爬山」）；整则消息都在泄露、无法改写时，才换成「这个我之后再跟你说」。
issues 写这则消息实际的问题，每项一句短语。
用简体中文回复，rewritten 和 issues 都用简体中文。

对外档案：
{{shareable_profile}}

消息：{{text}}

只输出 JSON：
{"ok": true, "rewritten": null, "issues": []}
或
{"ok": false, "rewritten": "改写后的消息", "issues": ["提到具体学校名称"]}
（上面只是格式示例，issues 照这则消息实际的问题写。）`

export const guardResultSchema = z.object({
  ok: z.boolean(),
  rewritten: z.string().trim().max(500).nullable().default(null),
  issues: z.array(z.string().trim().min(1).max(50)).max(10).default([]),
})

export type GuardLlmResult = z.infer<typeof guardResultSchema>

export interface GuardPromptVars {
  shareable: ShareableProfile | null
  text: string
}

/** 填入 system 的 {{...}}。用函式取代，避免內容裡的 $ 被當成替換語法。 */
export function renderGuardSystem(vars: GuardPromptVars): string {
  const values: Record<string, string> = {
    shareable_profile: vars.shareable ? shareableToText(vars.shareable) : '（没有对外档案）',
    text: vars.text,
  }
  return GUARD_PROMPT_SYSTEM.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match)
}
