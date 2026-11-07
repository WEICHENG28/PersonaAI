// E-2 合成题库：只加载与校验文件，不读取环境变量、不调用模型或数据库。
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { z } from 'zod'

const text = z.string().trim().min(1)
const id = z.string().regex(/^[a-z0-9-]+$/)
const strings = z.array(text)
const historyMessage = z.object({
  role: z.enum(['user', 'friend']), content: text,
  kind: z.enum(['chat', 'intro', 'task_card']).optional(), created_at: text.optional(),
}).strict()
const shareable = z.object({ intro: text, interests: strings, chat_style: text, looking_for: text }).strict()
const style = z.object({
  sentence_length: z.enum(['short', 'medium', 'long']), tone: text,
  emoji_level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  formality: z.enum(['casual', 'neutral', 'formal']),
}).strict()
export const twinSideSchema = z.object({ name: text, shareable, style, toneSamples: strings.optional() }).strict()
export const memoryScenarioSchema = z.object({
  id, kind: z.literal('memory'), userText: text, recent: strings, existing: strings,
  expect: z.object({ mustContain: strings.optional(), mustNotContain: strings.optional(),
    maxCount: z.number().int().nonnegative().optional() }).strict(),
}).strict()
export const profileScenarioSchema = z.object({
  id, kind: z.literal('profile'), userLines: strings.min(1),
  expect: z.object({ interestsMustNotInclude: strings, interestsMustInclude: strings.optional() }).strict(),
}).strict()
export const friendScenarioSchema = z.object({
  id, kind: z.literal('friend'), tags: strings.min(1), history: z.array(historyMessage),
  userText: text, memories: strings,
  expect: z.object({ taskIntent: z.boolean().optional() }).strict().optional(),
}).strict()
export const twinScenarioSchema = z.object({
  id, kind: z.literal('twin'), a: twinSideSchema, b: twinSideSchema, openingTopic: text,
  turns: z.number().int().positive(),
}).strict()
export const scenarioSchema = z.discriminatedUnion('kind', [
  memoryScenarioSchema, profileScenarioSchema, friendScenarioSchema, twinScenarioSchema,
])
export type MemoryScenario = z.infer<typeof memoryScenarioSchema>
export type ProfileScenario = z.infer<typeof profileScenarioSchema>
export type FriendScenario = z.infer<typeof friendScenarioSchema>
export type TwinSide = z.infer<typeof twinSideSchema>
export type TwinScenario = z.infer<typeof twinScenarioSchema>
export type Scenario = z.infer<typeof scenarioSchema>

/** 固定文件与顺序便于后续评测复现；不同题组的 id 也必须唯一。 */
export async function loadScenarios(dir = 'tests/eval-scenarios'): Promise<Scenario[]> {
  const scenarios: Scenario[] = []
  const seen = new Set<string>()
  for (const kind of ['memory', 'profile', 'friend', 'twin'] as const) {
    const data: unknown = JSON.parse(await readFile(resolve(dir, `${kind}.json`), 'utf-8'))
    for (const row of z.array(scenarioSchema).parse(data)) {
      if (row.kind !== kind) throw new Error(`题组类型不符：${kind}`)
      if (seen.has(row.id)) throw new Error(`题目 id 重复：${row.id}`)
      seen.add(row.id); scenarios.push(row)
    }
  }
  return scenarios
}
