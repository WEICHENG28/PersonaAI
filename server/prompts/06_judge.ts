// Prompt 6｜評審（docs/07B，MODEL_REASON，temperature 0.7）。擁有者：B。
import { z } from 'zod'

export function judgeSystem(perspectiveName: string): string {
  return `你是评审 Agent。站在「${perspectiveName}」的角度，判断对方适不适合他。

各项 1–5 分（整数）：
- topic_fit：话题是否自然延伸、互相追问
- engagement：回应是否积极（回复长度、提问比例）
- values：对事情的看法是否契合
- humor：玩笑接不接得住（没有出现幽默就给 3）
- smoothness：对话顺不顺（冷场、敷衍、观点冲突越多分数越低）
- condition_fit：对方符不符合 ${perspectiveName} 列出的条件（没有条件就给 3）

enough_info：对话内容不足以判断时为 false。
reason_type 与 reason_text：只在你认为不合适时填写。reason_type 为 condition_mismatch（对方特点不符合条件）或 friction（冷场、敷衍、观点冲突）；reason_text 用抽象特质描述，不提对方的具体事件与个资，30 字内。
outline：站在 ${perspectiveName} 的角度写这段对话的大纲，各项最多 3 点；highlights 是对方的亮点。
fit_points：只在你认为合适时填写，最多 3 点，每点对应一个 ${perspectiveName} 在意的条件或特质（concern），写出对方在对话中的具体表现（evidence，20–40 字，不写地址、学校、电话、真实人名等个资）与出现的轮数（round）。不合适时输出空阵列。
所有文字用简体中文。

只输出 JSON：
{
  "scores": {"topic_fit": 4, "engagement": 4, "values": 3, "humor": 3, "smoothness": 4, "condition_fit": 5},
  "enough_info": true,
  "reason_type": null,
  "reason_text": null,
  "outline": {
    "topics": ["…"], "fits": ["…"], "frictions": ["…"], "highlights": ["…"],
    "fit_points": [{"concern": "喜欢登山", "evidence": "主动分享最近的登山行程，还追问你常去哪里", "round": 5}]
  }
}`
}

const score = z.coerce.number().int().min(1).max(5)
const list = z.array(z.string()).default([]).transform((a) => a.slice(0, 3))

/** 有些模型把 fit_points 放在最外層而不是 outline 裡，先搬回 outline。 */
function liftFitPoints(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  const v = value as Record<string, unknown>
  const outline = (v.outline && typeof v.outline === 'object' ? v.outline : {}) as Record<string, unknown>
  if (Array.isArray(v.fit_points) && !Array.isArray(outline.fit_points)) return { ...v, outline: { ...outline, fit_points: v.fit_points } }
  return value
}

const judgeObject = z.object({
  scores: z.object({ topic_fit: score, engagement: score, values: score, humor: score, smoothness: score, condition_fit: score }),
  enough_info: z.boolean().default(true),
  reason_type: z.enum(['condition_mismatch', 'friction']).nullish().catch(null),
  reason_text: z.string().nullish(),
  outline: z
    .object({
      topics: list,
      fits: list,
      frictions: list,
      highlights: list,
      fit_points: z
        .array(z.object({ concern: z.string(), evidence: z.string(), round: z.coerce.number().int().min(1) }))
        .default([])
        .transform((a) => a.slice(0, 3)),
    })
    .default({ topics: [], fits: [], frictions: [], highlights: [], fit_points: [] }),
})

export const judgeSchema = z.preprocess(liftFitPoints, judgeObject)

export type JudgeRun = z.infer<typeof judgeObject>

export function judgeUser(input: { purpose: string; preferences: unknown; otherShareable: unknown; transcript: string }): string {
  return `输入：
- 找人目的：${input.purpose}
- 偏好与条件：${JSON.stringify(input.preferences)}
- 对方的对外档案：${JSON.stringify(input.otherShareable)}
- 对话纪录（双方都是分身，代表各自的说话风格与对外资料）：
${input.transcript}`
}
