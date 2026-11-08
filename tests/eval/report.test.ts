import { describe, expect, it } from 'vitest'
import { buildConfig, csvEscape, percentile, summarize, suiteStats, toBlindPairs, type EvalRow } from '../../scripts/eval/report.js'
import { parseArgs } from '../../scripts/eval/run.js'
import { winRate } from '../../scripts/eval/compare.js'

const score = { catch: 4, not_interview: 4, no_copy: 5, persona: 4, length: 3, reason: 'x' }

function row(over: Partial<EvalRow>): EvalRow {
  return { suite: 'friend', scenarioId: 'f1', repeat: 1, model: 'm', output: '好', pass: null, ttftMs: null, totalMs: 1000, completionTokens: 10, llmCalls: 1, ...over }
}

describe('彙整', () => {
  it('問號比例、通過率、評審平均、延遲百分位', () => {
    const rows = [
      row({ scenarioId: 'a', endsWithQuestion: true, scores: score, totalMs: 1000, pass: true }),
      row({ scenarioId: 'b', endsWithQuestion: false, scores: score, totalMs: 3000, pass: false, failReason: '找人意图错' }),
      row({ scenarioId: 'c', endsWithQuestion: false, totalMs: 2000 }),
      row({ scenarioId: 'd', error: 'timeout', totalMs: 99999 }),
    ]
    const s = suiteStats(rows)
    expect(s.questionRatio).toBeCloseTo(1 / 3)
    expect(s.passRate).toBe(0.5)
    expect(s.scoreAvg).toBeCloseTo(4)
    expect(s.p50TotalMs).toBe(2000) // 出錯的那題不算延遲
    expect(s.errors).toBe(1)
    const md = summarize(rows)
    expect(md).toContain('| friend | 4 | 1 | 50% |')
    expect(md).toContain('33%')
    expect(md).toContain('friend/b#1：找人意图错')
    expect(md).toContain('friend/d#1：timeout')
  })

  it('照抄比例看 copySim ≥ 0.6', () => {
    expect(suiteStats([row({ copySim: 0.7 }), row({ copySim: 0.2 })]).copyRatio).toBe(0.5)
  })

  it('百分位', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5)
    expect(percentile([], 50)).toBeNull()
  })
})

describe('盲測對照', () => {
  const a = Array.from({ length: 12 }, (_, i) => row({ scenarioId: `f${i}`, output: `A${i}`, context: `用户：${i}` }))
  const b = a.map(r => ({ ...r, output: r.output.replace('A', 'B') }))

  it('同一個 seed 結果固定；A、B 都會出現在 reply_1', () => {
    const first = toBlindPairs(a, b, 7)
    expect(toBlindPairs(a, b, 7)).toEqual(first)
    const firstCol = first.csv.trim().split('\n').slice(1).map(l => l.split(',')[3]!)
    expect(firstCol.some(x => x.startsWith('A'))).toBe(true)
    expect(firstCol.some(x => x.startsWith('B'))).toBe(true)
    expect(first.csv.split('\n')[0]).toBe('pair_id,scenario_id,context,reply_1,reply_2,pick,notes')
    expect(Object.keys(first.key)).toHaveLength(12)
  })

  it('記憶、檔案題和出錯的題不配對；只配同一題同一次', () => {
    const pairs = toBlindPairs([...a.slice(0, 2), row({ suite: 'memory', scenarioId: 'm1' }), row({ scenarioId: 'x', error: 'boom' })], [...b.slice(0, 1), row({ suite: 'memory', scenarioId: 'm1' })], 1)
    expect(Object.keys(pairs.key)).toHaveLength(1)
  })

  it('勝率：pick 1／2 對照答案算新版（B）贏幾次', () => {
    expect(winRate([{ pairId: 'p001', pick: '1' }, { pairId: 'p002', pick: '2' }, { pairId: 'p003', pick: '' }], { p001: 'B', p002: 'B', p003: 'A' })).toEqual({ bWins: 1, total: 2, rate: 0.5 })
  })
})

describe('CSV 與設定檔', () => {
  it('csvEscape', () => {
    expect(csvEscape('a,"b"\n')).toBe('"a,""b""\n"')
    expect(csvEscape('普通')).toBe('普通')
  })

  it('config 只有模型名，沒有金鑰和網址', () => {
    const config = buildConfig({ label: 'baseline', suites: ['friend'], repeat: 2, models: { chat: 'Kimi-K2.6', judge: 'Qwen3.8-Max' }, startedAt: '2026-11-08T00:00:00Z' })
    const text = JSON.stringify(config)
    expect(text).not.toMatch(/http|key|LLM_API/i)
    expect(config.models.chat).toBe('Kimi-K2.6')
  })
})

describe('命令列參數', () => {
  it('--help 不需要其他參數；--label 必填；題組要認得', () => {
    expect(parseArgs(['--help'])).toBe('help')
    expect(() => parseArgs(['--suite', 'friend'])).toThrow('--label')
    expect(() => parseArgs(['--label', 'x', '--suite', 'nope'])).toThrow('不认识')
    expect(parseArgs(['--label', 'baseline', '--suite', 'friend,twin', '--repeat', '2', '--judge-model', 'J'])).toEqual({
      suites: ['friend', 'twin'], label: 'baseline', repeat: 2, models: { chat: undefined, fast: undefined, reason: undefined, judge: 'J' },
    })
  })
})
