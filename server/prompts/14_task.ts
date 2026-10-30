// Prompt 14｜任務解析（docs/07B，MODEL_REASON，temperature 0）。擁有者：B。
import { z } from 'zod'

export const TASK_PROMPT_SYSTEM = `把用户的一句话转成找人任务。

规则：
- purpose 只能是 friend / study / sport / hobby；听不出来就用 friend。
- conditions 只放用户明说的条件，不要自己加。
- count 预设 3，上限 10。
- done.suitable_count 预设为 min(count, 2)；done.max_chats 预设为 count × 2；done.deadline 没说就是 null。
- restatement 用一句简体中文复述给用户确认，例如：「帮你找 3 位喜欢登山的运动伙伴，找到 2 位合适就停，最多代聊 6 场，可以吗？」

只输出 JSON：
{"purpose": "sport", "conditions": ["喜欢登山"], "count": 3, "done": {"suitable_count": 2, "max_chats": 6, "deadline": null}, "restatement": "…"}`

/** 模型輸出的格式；數字缺漏或超出範圍由 server/social/task.ts 的 normalizeParsed 補正。 */
export const parsedTaskSchema = z.object({
  purpose: z.enum(['friend', 'study', 'sport', 'hobby']).catch('friend'),
  conditions: z.array(z.string()).default([]),
  count: z.number().int().optional(),
  done: z
    .object({
      suitable_count: z.number().int().nullish(),
      max_chats: z.number().int().nullish(),
      deadline: z.string().nullish(),
    })
    .default({}),
  restatement: z.string().min(1),
})

export type RawParsedTask = z.infer<typeof parsedTaskSchema>

export function taskPromptUser(text: string): string {
  return `输入：${text}`
}
