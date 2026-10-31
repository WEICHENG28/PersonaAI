/**
 * Demo 任务确认卡：从一句话解析人数、条件、目的、完成条件（UX #4）。
 * 只在 mock 模式用；http 模式由后端（B 线）解析。
 */

export interface TaskDraft {
  count: number
  /** 「喜欢 X」；没写就是「不限」 */
  condition: string
  goal: string
  doneWhen: string
  /** demo 只有登山剧本：条件是登山才是 true */
  isDemoScript: boolean
}

const DEFAULT_COUNT = 3
const MAX_COUNT = 10
const CN_DIGITS: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
}

const GOAL_RULES: { test: RegExp; goal: string }[] = [
  { test: /登山|爬山|跑步/, goal: '运动伙伴' },
  { test: /读书/, goal: '读书搭子' },
  { test: /电影|看展/, goal: '兴趣搭子' },
]

/** 完成条件：找到 ⌈人数×2/3⌉ 位双向合适就停（至少 1 位） */
export function suitableTarget(count: number): number {
  return Math.max(1, Math.ceil((count * 2) / 3))
}

function parseCount(text: string): number {
  const m = /(\d+|[一二两三四五六七八九十])\s*(?:个|位|名|人)/.exec(text)
  if (!m) return DEFAULT_COUNT
  const raw = m[1]!
  const n = /^\d+$/.test(raw) ? Number(raw) : (CN_DIGITS[raw] ?? DEFAULT_COUNT)
  return Math.min(MAX_COUNT, Math.max(1, n))
}

function parseCondition(text: string): string {
  const m = /喜欢\s*([^的，,。！!？?\s]+)\s*的/.exec(text)
  return m ? `喜欢${m[1]}` : '不限'
}

export function parseTaskDraft(text: string): TaskDraft {
  const count = parseCount(text)
  const condition = parseCondition(text)
  const goal = GOAL_RULES.find((r) => r.test.test(text))?.goal ?? '聊天朋友'
  return {
    count,
    condition,
    goal,
    doneWhen: `找到 ${suitableTarget(count)} 位双向合适就停`,
    isDemoScript: /登山|爬山/.test(condition),
  }
}
