// C9／C10 大厅的纯函数与画面文字（不碰网络，方便测试）。拥有者：C。
// strings.json 已有的文字（lobby.*）照旧用 t()；这里只放新增的，之后要搬过去再和 A 讨论。
import type { LobbyFit } from '../../../lib/api/twin'

export const LOBBY_TEXT = {
  twinChat: '让分身去聊',
  humanChat: '自己聊',
  starting: '处理中…',
  loadFailed: '大厅暂时读不到，请稍后再试',
  retry: '再试一次',
  empty: '大厅里暂时没有可以聊的人',
  noCards: '大厅里暂时没有符合的人',
  taskHint: '这听起来像要交给社交 Agent 的任务，确认后它会帮你去找：',
} as const

/** AI 预估的文字（07C C9：很可能合得来／可以聊聊看／差异较大，不显示数字）。 */
export const FIT_TEXT: Record<LobbyFit, string> = {
  likely: '很可能合得来',
  maybe: '可以聊聊看',
  different: '差异较大',
}

export const FIT_TONE: Record<LobbyFit, 'mint' | 'pear' | 'paper'> = {
  likely: 'mint',
  maybe: 'pear',
  different: 'paper',
}

/** mock 模式的假资料是 0～100 的数字，画面只显示等级文字。 */
export function fitOfPercent(percent: number): LobbyFit {
  if (percent >= 80) return 'likely'
  if (percent >= 70) return 'maybe'
  return 'different'
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}
