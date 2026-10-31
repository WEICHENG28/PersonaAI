// C9 大厅的纯函数与画面文字（不碰网络，方便测试）。拥有者：C。
// 文字先放这里：messages/strings.json 是 A 的档案，之后要搬过去再和 A 讨论。
import type { FitLevel, LobbyPurpose } from '../../../lib/api/twin'

export const LOBBY_TEXT = {
  filterLabel: '找人目的',
  allPurposes: '全部',
  purpose: { friend: '交友', study: '学习', sport: '运动', hobby: '兴趣' } satisfies Record<LobbyPurpose, string>,
  searchPlaceholder: '兴趣关键字，例如：登山',
  search: '搜索',
  clear: '清除',
  fit: { likely: '很可能合得来', maybe: '可以聊聊看', different: '差异较大' } satisfies Record<FitLevel, string>,
  fitUnknown: '确认档案后才能预估',
  chatMyself: '我自己聊',
  sendTwin: '让分身去聊',
  starting: '处理中…',
  loading: '正在整理大厅卡片，第一次会久一点…',
  empty: '没有符合条件的人，换个目的或关键字试试',
  loadFailed: '大厅暂时打不开',
  retry: '重新载入',
  noCards: '大厅里暂时没有符合的人',
  taskHint: '这听起来像要交给社交 Agent 的任务，确认后它会帮你去找：',
} as const

/** 助手问题的字数上限（和后端一致）。 */
export const QUESTION_MAX = 200

export const PURPOSE_OPTIONS: readonly LobbyPurpose[] = ['friend', 'study', 'sport', 'hobby']

/** 关键字和后端一致：去掉前后空白、最多 30 字。 */
export const LOBBY_QUERY_MAX = 30

export function fitText(fit: FitLevel | null): string {
  return fit ? LOBBY_TEXT.fit[fit] : LOBBY_TEXT.fitUnknown
}

/** mock 模式的假资料是 0–100 的数字；画面不显示数字，换成同样的三级文字。 */
export function fitFromPercent(percent: number): FitLevel {
  if (percent >= 80) return 'likely'
  if (percent >= 65) return 'maybe'
  return 'different'
}
