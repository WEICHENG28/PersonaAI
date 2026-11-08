// E-1 自然度評審：讓模型（reason）照固定量表替「最新一則回覆」打 5 項分數。只在評測時用，不進正式流程。
import { z } from 'zod'
import { llmJson } from '../../server/lib/llm/index.js'

/** 固定文案（AI 優化計畫 E-1），逐字照抄。 */
export const NATURALNESS_RUBRIC_SYSTEM = `你是对话质量评审。下面是一段聊天记录和 AI 的最新一则回复。只评这一则回复，各项 1–5 分（整数）：
- catch（接得住）：有没有回应到对方这句话里最具体的内容或情绪
- not_interview（不像面试）：没有为了延续对话硬问问题；连续追问、像问卷一样要扣分
- no_copy（不照抄）：没有复述对方的话，没有套用固定句式或模板
- persona（人格一致）：符合下面的人设，不油腻、不像客服
- length（长度合适）：像微信聊天的长度，不长篇大论，也不敷衍
人设：{{persona}}
只输出 JSON：{"catch": 4, "not_interview": 4, "no_copy": 5, "persona": 4, "length": 5, "reason": "一句话理由"}`

const score = z.number().int().min(1).max(5)

export const naturalnessScoreSchema = z.object({
  catch: score,
  not_interview: score,
  no_copy: score,
  persona: score,
  length: score,
  reason: z.string(),
})

export type NaturalnessScore = z.infer<typeof naturalnessScoreSchema>

export const NATURALNESS_KEYS = ['catch', 'not_interview', 'no_copy', 'persona', 'length'] as const

export interface JudgeInput {
  /** 人設描述（阿澈或分身）。 */
  persona: string
  /** 時間正序的對話，speaker 是顯示名稱（例如「用户」「阿澈」）。 */
  history: { speaker: string; content: string }[]
  /** 要評的這一則回覆。 */
  reply: string
}

export function renderJudgeSystem(persona: string): string {
  // 用函式取代：人設文字裡的 $& 之類不會被當成取代語法
  return NATURALNESS_RUBRIC_SYSTEM.replace('{{persona}}', () => persona)
}

export function judgeUserMessage(input: JudgeInput): string {
  const lines = input.history.map(h => `${h.speaker}：${h.content}`).join('\n') || '（没有更早的对话）'
  return `【聊天记录】\n${lines}\n\n【要评的回复】\n${input.reply}`
}

/** 評一則回覆；溫度 0，結果用 schema 驗證。 */
export async function judgeReply(input: JudgeInput): Promise<NaturalnessScore> {
  return llmJson({
    role: 'reason',
    tag: 'eval.judge',
    system: renderJudgeSystem(input.persona),
    messages: [{ role: 'user', content: judgeUserMessage(input) }],
    temperature: 0,
    schema: naturalnessScoreSchema,
  })
}

/** 5 項平均（評測報告用）。 */
export function averageScore(s: NaturalnessScore): number {
  return NATURALNESS_KEYS.reduce((sum, k) => sum + s[k], 0) / NATURALNESS_KEYS.length
}
