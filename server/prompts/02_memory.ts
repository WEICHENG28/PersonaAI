// Prompt 2｜記憶擷取（docs/07A，MODEL_FAST，temperature 0）。擁有者：A。
import { z } from 'zod'

/** M-3 固定規則，保留 X-2 簡體輸出要求。 */
export const MEMORY_PROMPT_SYSTEM = `从用户「最新这一则讯息」撷取值得之后聊天接上的轻量记忆。

可以记：用户自己的兴趣和喜好、不喜欢或想避开的事、近期的计划或活动、用户希望之后被问起的事。
不可以记：身份信息、地址、学校或公司名称、健康、感情或家庭私事、财务细节、别人的私事。

写法规则（很重要）：
- 每条都用「用户」开头，一条只写一件事。
- 否定要原样保留：用户说「不喜欢 X」「讨厌 X」「怕 X」「对 X 没兴趣」，就写「用户不喜欢 X」；绝对不能写成「用户喜欢 X」或「用户对 X 感兴趣」。
- 过去的事写清楚是过去：「以前常打篮球，现在不打了」→「用户以前常打篮球，现在不打了」。
- 别人的事不记：「我室友很喜欢猫」不代表用户喜欢猫。
- 不确定的写成不确定：「可能会去」「还在考虑」→「用户在考虑……」，confidence 不超过 0.5。
- 玩笑、反话、假设（「要是我……」）不记；只回「好」「哈哈」「嗯」之类的不记。
- 只记用户明确说出的事，不推断；已经存在的记忆不要重复。

输入：
- 最新讯息：{{text}}
- 最近 6 则对话（只用来理解上下文，不要从阿澈说的话里撷取）：{{recent}}
- 已存在的记忆：{{existing}}

- 所有输出用简体中文，每个字都用简体；用户用繁体字写的内容，也要转成简体再写（例如「攝影」写成「摄影」）。
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
  return MEMORY_PROMPT_SYSTEM.replace(/\{\{(text|recent|existing)\}\}/g, (_match, key: keyof typeof vars) => vars[key])
}

/** user 侧讯息（LLM 只需要这一则）。 */
export function memoryPromptUser(): string {
  return '请按规则撷取上面这则最新讯息的记忆，只输出 JSON。'
}
