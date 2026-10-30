// Prompt 2｜記憶擷取（docs/07A，MODEL_FAST，temperature 0）。擁有者：A。
import { z } from 'zod'

/** 07A 規格逐字，介面文字簡體。 */
export const MEMORY_PROMPT_SYSTEM = `从用户「最新这一则讯息」撷取值得之后聊天接上的轻量记忆。

可以记：兴趣、近期的计划或活动、用户希望之后被问起的事。
不可以记：身份信息、地址、学校或公司名称、健康、感情或家庭私事、财务细节、别人的私事。
只记用户明确说出的事，不推断；已经存在的记忆不要重复。

输入：
- 最新讯息：{{text}}
- 最近 6 则对话：{{recent}}
- 已存在的记忆：{{existing}}

只输出 JSON：
{"memories": [{"content": "用户计划周末去漫展", "confidence": 0.9}]}
没有可记的就输出 {"memories": []}`

export const extractedMemoriesSchema = z.object({
  memories: z
    .array(
      z.object({
        content: z.string().min(1),
        confidence: z.number().min(0).max(1),
      }),
    )
    .default([]),
})

export type ExtractedMemories = z.infer<typeof extractedMemoriesSchema>

/** 填入 system 的 {{...}}。 */
export function renderMemorySystem(vars: { text: string; recent: string; existing: string }): string {
  return MEMORY_PROMPT_SYSTEM.replace('{{text}}', vars.text)
    .replace('{{recent}}', vars.recent)
    .replace('{{existing}}', vars.existing)
}

/** user 侧讯息（LLM 只需要这一则）。 */
export function memoryPromptUser(text: string): string {
  return `最新讯息：${text}`
}
