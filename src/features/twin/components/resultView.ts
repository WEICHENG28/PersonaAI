// C5 结果页的纯函数与画面文字（不碰网络，方便测试）。拥有者：C。
// strings.json 已有的文字（result.*）照旧用 t()；这里只放新增的，之后要搬过去再和 A 讨论。
import type { ResultMessage, ResultView } from '../../../lib/api/twin'
import { verdictText } from './chatRoomView'

export const RESULT_TEXT = {
  mutualEmoji: '💞',
  concern: (concern: string) => `你在意的：${concern}`,
  verdictPrefix: '对你来说：',
  verdictPending: '评审 Agent 还没有给出判定',
  outlinePending: '评审给出结果后，这里会整理对话大纲',
  outlineEmpty: '暂无',
  logEmpty: '还没有对话',
  continuing: '分身正在继续聊，大约需要一分钟…',
  continued: '分身又聊了几轮，新的对话已经加进完整纪录',
  continuedEnded: '分身又聊了几轮，已经聊到上限',
  comingSoon: '即将上线',
  loadFailedTitle: '打不开这个结果',
  back: '回到上一页',
} as const

/** 「对你来说：合适 · 走势持平」；还没有判定时给提示。 */
export function verdictLine(verdict: ResultView['verdict']): string {
  const text = verdictText(verdict)
  return text ? `${RESULT_TEXT.verdictPrefix}${text}` : RESULT_TEXT.verdictPending
}

export interface RoundGroup {
  round: number
  messages: ResultMessage[]
}

/** 依轮数分组（消息已依时间排好）；点「第 n 轮」时捲到那一组并标亮。 */
export function groupByRound(messages: readonly ResultMessage[]): RoundGroup[] {
  const groups: RoundGroup[] = []
  for (const m of messages) {
    const last = groups.at(-1)
    if (last && last.round === m.round) groups[groups.length - 1] = { ...last, messages: [...last.messages, m] }
    else groups.push({ round: m.round, messages: [m] })
  }
  return groups
}
