// Prompt 3｜用户档案撷取（docs/07A，MODEL_REASON，temperature 0.2）。拥有者：A。
import { z } from 'zod'

/** 07A 规格逐字，仅介面文字简体。 */
export const PROFILE_PROMPT_SYSTEM = `你在后台分析用户和 AI 朋友的对话，建立两份资料。

规则：
- 同一个特质要在不同事件中出现至少 2 次，confidence 才能 ≥ 0.5；只出现 1 次的 confidence ≤ 0.3。
- 不根据沉默、回复短、打字慢推断内向、冷漠或心理状态。
- 不写入任何敏感信息（身份、地址、学校公司、健康、创伤、财务细节）。
- shareable_profile 会给其他用户看：只写兴趣与聊天偏好，语气中性，不写具体事件、人名、地点。
- evidence 与 style 用抽象描述，不可引用用户原句。
- 资讯不足的栏位维持上一版的值；没有上一版就给 score 50、confidence 0.1。

输入：
- 用户说过的话：{{user_lines}}
- 上一版资料：{{previous}}

只输出 JSON：
{
  "shareable_profile": {"intro": "20 字內", "interests": ["…"], "chat_style": "…", "looking_for": "…"},
  "agent_profile": {
    "big_five": {
      "O": {"score": 0-100, "confidence": 0-1, "evidence": "…"},
      "C": {…}, "E": {…}, "A": {…}, "N": {…}
    },
    "values": ["…"],
    "style": {"sentence_length": "short|medium|long", "tone": "…", "emoji_level": 0-3, "formality": "casual|neutral|formal"}
  }
}`

const traitScoreSchema = z.object({
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  evidence: z.string().default(''),
})

const styleSchema = z.object({
  sentence_length: z.enum(['short', 'medium', 'long']),
  tone: z.string().default(''),
  emoji_level: z.number().int().min(0).max(3).default(1),
  formality: z.enum(['casual', 'neutral', 'formal']).default('casual'),
})

export const profileExtractSchema = z.object({
  shareable_profile: z.object({
    intro: z.string().default(''),
    interests: z.array(z.string()).default([]),
    chat_style: z.string().default(''),
    looking_for: z.string().default(''),
  }),
  agent_profile: z.object({
    big_five: z.object({
      O: traitScoreSchema,
      C: traitScoreSchema,
      E: traitScoreSchema,
      A: traitScoreSchema,
      N: traitScoreSchema,
    }),
    values: z.array(z.string()).default([]),
    style: styleSchema,
  }),
})

export type ProfileExtract = z.infer<typeof profileExtractSchema>

/** 填入 system 的 {{...}}。 */
export function renderProfileSystem(vars: { userLines: string; previous: string }): string {
  return PROFILE_PROMPT_SYSTEM.replace('{{user_lines}}', vars.userLines)
    .replace('{{previous}}', vars.previous)
}

/** 撷取行数上限（07A A4：最新 60 则，只取 role user）。 */
export const PROFILE_USER_LINES_LIMIT = 60
