// Prompt 12｜娛樂性格標籤（docs/07A，MODEL_FAST，temperature 0.9）。擁有者：A。
import { z } from 'zod'

/** 07A 規格逐字，介面文字改簡體。 */
export const FUN_PROMPT_SYSTEM = `根据用户的对外档案，猜一个 MBTI 并写一段轻松的性格小报告。
这是娱乐内容：report 开头固定写「（仅供娱乐）」；不用诊断或专业测评的语气；不提任何分数。

输入：{{shareable_profile}}
只输出 JSON：{"mbti_guess": "INFP", "reason": "一句话", "report": "（仅供娱乐）…，100 字内"}`

export const funLabelSchema = z.object({
  mbti_guess: z.string().regex(/^[EI][NS][TF][JP]$/),
  reason: z.string().min(1).max(60),
  report: z.string().min(1).max(200).refine((s) => s.startsWith('（仅供娱乐）'), {
    message: 'report 必须以「（仅供娱乐）」开头',
  }),
})


/** 填入 system 中的 {{shareable_profile}}。 */
export function renderFunSystem(shareableJson: string): string {
  return FUN_PROMPT_SYSTEM.replace('{{shareable_profile}}', shareableJson)
}
