import type { Verdict } from '@lib/api/types'
import {
  fitPoints,
  handoffSuggestDefault,
  handoffSuggestItems,
  judgeVerdicts,
  outlineItems,
  proxyScript,
  taskLogBeats,
  type RoundItem,
} from './scenario'

/**
 * Demo 代聊时间轴（UX #1）：所有事件用「绝对时间」排好，不再递回累加延迟。
 * 讯息每 MSG_INTERVAL 一则；判定在该轮最后一则讯息之后；「双向合适」（done）一定最后。
 * store 只负责依序套用事件，重新整理后用 remainingSchedule 从进度接着跑。
 */

/** 开工日志之间的间隔 */
export const LOG_GAP = 500
/** 第一则讯息出现的时间 */
export const MSG_START = 2500
/** 讯息固定间隔 */
export const MSG_INTERVAL = 1600
/** 该轮最后一则讯息出现后，多久出判定 */
export const VERDICT_DELAY = 800
/** 同一个锚点的多笔日志之间的间隔 */
const SAME_ANCHOR_GAP = 400
/** 隐私日志在讯息出现后多久写入 */
const PRIVACY_DELAY = 300
/** 最终判定后多久宣布「双向合适」 */
const DONE_DELAY = 600

export type ProxyEvent =
  | { at: number; kind: 'msg'; step: number }
  | { at: number; kind: 'verdict'; index: number }
  | { at: number; kind: 'log'; index: number }
  | { at: number; kind: 'done' }

/** 同一时间的事件：先讯息、再判定、再日志、最后 done */
const KIND_ORDER: Record<ProxyEvent['kind'], number> = { msg: 0, verdict: 1, log: 2, done: 3 }

export function msgAt(step: number): number {
  return MSG_START + step * MSG_INTERVAL
}

/** 某一轮最后一则讯息的 index（找不到回 -1） */
export function lastStepOfRound(round: number): number {
  let last = -1
  proxyScript.forEach((m, i) => {
    if (m.round === round) last = i
  })
  return last
}

function verdictAt(round: number): number {
  return msgAt(lastStepOfRound(round)) + VERDICT_DELAY
}

function doneAt(): number {
  const finalRound = judgeVerdicts[judgeVerdicts.length - 1]?.round ?? 0
  const afterVerdict = verdictAt(finalRound) + DONE_DELAY
  const afterLastMsg = msgAt(proxyScript.length - 1) + DONE_DELAY
  return Math.max(afterVerdict, afterLastMsg)
}

function logAt(index: number, sameAnchorRank: number): number {
  const anchor = taskLogBeats[index]!.anchor
  const extra = sameAnchorRank * SAME_ANCHOR_GAP
  switch (anchor.kind) {
    case 'start':
      return sameAnchorRank * LOG_GAP
    case 'msg':
      return msgAt(anchor.step) + PRIVACY_DELAY + extra
    case 'verdict':
      return verdictAt(anchor.round) + extra
    case 'done':
      return doneAt() + extra
  }
}

/** 建出整段代聊的事件表（依时间排序） */
export function buildProxyTimeline(): ProxyEvent[] {
  const events: ProxyEvent[] = []
  proxyScript.forEach((_, step) => events.push({ at: msgAt(step), kind: 'msg', step }))
  judgeVerdicts.forEach((v, index) => events.push({ at: verdictAt(v.round), kind: 'verdict', index }))

  const rankByAnchor = new Map<string, number>()
  taskLogBeats.forEach((beat, index) => {
    const key = JSON.stringify(beat.anchor)
    const rank = rankByAnchor.get(key) ?? 0
    rankByAnchor.set(key, rank + 1)
    events.push({ at: logAt(index, rank), kind: 'log', index })
  })
  events.push({ at: doneAt(), kind: 'done' })

  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.at - b.e.at || KIND_ORDER[a.e.kind] - KIND_ORDER[b.e.kind] || a.i - b.i)
    .map(({ e }) => e)
}

/** 从第 tick 个事件接着跑：每个事件距离「上一个已套用事件」的延迟 */
export function remainingSchedule(events: ProxyEvent[], tick: number): { event: ProxyEvent; delay: number }[] {
  const base = tick > 0 ? events[tick - 1]!.at : 0
  return events.slice(tick).map((event) => ({ event, delay: event.at - base }))
}

/** 讯息全部出现过的最大轮次（proxyStep＝已出现的剧本讯息数） */
export function completedRound(proxyStep: number): number {
  let done = 0
  for (const round of new Set(proxyScript.map((m) => m.round))) {
    if (lastStepOfRound(round) < proxyStep) done = Math.max(done, round)
  }
  return done
}

/** 最近两次判定的走势（差距 < 3 分算持平） */
export function trendOf(verdicts: Pick<Verdict, 'mine'>[]): 'up' | 'flat' | 'down' {
  if (verdicts.length < 2) return 'flat'
  const diff = verdicts[verdicts.length - 1]!.mine - verdicts[verdicts.length - 2]!.mine
  if (diff >= 3) return 'up'
  if (diff <= -3) return 'down'
  return 'flat'
}

// ── 结果页、接手卡：只引用已经出现过的轮次 ──

const upTo = (items: RoundItem[], round: number) => items.filter((x) => x.round <= round).map((x) => x.text)

export function fitPointsUpTo(round: number) {
  return fitPoints.filter((f) => f.round <= round)
}

export function outlineUpTo(round: number) {
  return {
    topics: upTo(outlineItems.topics, round),
    fitPoints: upTo(outlineItems.fitPoints, round),
    frictionPoints: upTo(outlineItems.frictionPoints, round),
    highlights: upTo(outlineItems.highlights, round),
  }
}

export function handoffSuggestUpTo(round: number): string[] {
  const list = upTo(handoffSuggestItems, round)
  return list.length > 0 ? list : [handoffSuggestDefault]
}
