import { describe, expect, it } from 'vitest'
import {
  MSG_INTERVAL,
  buildProxyTimeline,
  completedRound,
  lastStepOfRound,
  msgAt,
  remainingSchedule,
  trendOf,
  type ProxyEvent,
} from '../../src/demo/proxyTimeline'
import { judgeVerdicts, proxyScript, taskLogBeats } from '../../src/demo/scenario'

const events = buildProxyTimeline()
const atOf = (pred: (e: ProxyEvent) => boolean) => events.find(pred)!.at

describe('代聊时间轴（UX #1）', () => {
  it('讯息是固定间隔的绝对排程，14 则约 23 秒跑完', () => {
    const msgs = events.filter((e) => e.kind === 'msg')
    expect(msgs).toHaveLength(proxyScript.length)
    for (let i = 1; i < msgs.length; i++) {
      expect(msgs[i]!.at - msgs[i - 1]!.at).toBe(MSG_INTERVAL)
    }
    expect(msgs.at(-1)!.at).toBeLessThanOrEqual(24_000)
  })

  it('事件依时间排序，每种事件各出现一次', () => {
    for (let i = 1; i < events.length; i++) expect(events[i]!.at).toBeGreaterThanOrEqual(events[i - 1]!.at)
    expect(events.filter((e) => e.kind === 'verdict')).toHaveLength(judgeVerdicts.length)
    expect(events.filter((e) => e.kind === 'log')).toHaveLength(taskLogBeats.length)
    expect(events.filter((e) => e.kind === 'done')).toHaveLength(1)
  })

  it('第 N 轮判定在该轮最后一则讯息出现之后', () => {
    judgeVerdicts.forEach((v, index) => {
      const verdictAt = atOf((e) => e.kind === 'verdict' && e.index === index)
      expect(verdictAt).toBeGreaterThan(msgAt(lastStepOfRound(v.round)))
    })
  })

  it('判定日志不会早于判定本身；隐私日志不会早于对应讯息', () => {
    taskLogBeats.forEach((beat, index) => {
      const logAt = atOf((e) => e.kind === 'log' && e.index === index)
      if (beat.anchor.kind === 'verdict') {
        const vIndex = judgeVerdicts.findIndex((v) => v.round === (beat.anchor as { round: number }).round)
        expect(logAt).toBeGreaterThanOrEqual(atOf((e) => e.kind === 'verdict' && e.index === vIndex))
      }
      if (beat.anchor.kind === 'msg') expect(logAt).toBeGreaterThan(msgAt(beat.anchor.step))
    })
  })

  it('「双向合适」（done）是最后一个事件，在最后一则讯息和最终判定之后', () => {
    const last = events.at(-1)!
    expect(last.kind).toBe('done')
    expect(last.at).toBeGreaterThan(msgAt(proxyScript.length - 1))
    expect(last.at).toBeGreaterThan(atOf((e) => e.kind === 'verdict' && e.index === judgeVerdicts.length - 1))
  })

  it('completedRound：只算讯息全部出现过的轮次', () => {
    expect(completedRound(0)).toBe(0)
    expect(completedRound(1)).toBe(0)
    expect(completedRound(2)).toBe(1)
    expect(completedRound(3)).toBe(1)
    expect(completedRound(4)).toBe(2)
    expect(completedRound(proxyScript.length)).toBe(7)
  })

  it('remainingSchedule：重新整理后从进度接着跑，间隔照原本的绝对排程', () => {
    const rest = remainingSchedule(events, 10)
    expect(rest).toHaveLength(events.length - 10)
    expect(rest[0]!.delay).toBe(events[10]!.at - events[9]!.at)
    expect(rest.at(-1)!.delay).toBe(events.at(-1)!.at - events[9]!.at)
    expect(remainingSchedule(events, 0)[0]!.delay).toBe(events[0]!.at)
    expect(remainingSchedule(events, events.length)).toEqual([])
  })
})

describe('trendOf：依最近两次判定算走势（UX #24）', () => {
  it('上升、下降、持平、只有一次', () => {
    expect(trendOf([{ mine: 68 }, { mine: 76 }])).toBe('up')
    expect(trendOf([{ mine: 76 }, { mine: 70 }])).toBe('down')
    expect(trendOf([{ mine: 70 }, { mine: 71 }])).toBe('flat')
    expect(trendOf([{ mine: 70 }])).toBe('flat')
    expect(trendOf([])).toBe('flat')
  })
})
