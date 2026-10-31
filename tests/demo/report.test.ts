import { describe, expect, it } from 'vitest'
import { demoReportStats, reportLead } from '../../src/demo/report'
import { DEMO_SCREENED } from '../../src/demo/scenario'

describe('demoReportStats：回报卡数字从 store 算（UX #7、#24）', () => {
  it('代聊结束：代聊 2 场（陈岭＋林小山）、合适数＝任务进度、省下时间＝场数×设定分钟', () => {
    const s = demoReportStats({ proxyDone: true, progress: 1, avgManualMin: 30 })
    expect(s).toEqual({ screened: DEMO_SCREENED, chats: 2, fit: 1, savedMinutes: 60 })
  })

  it('代聊还没结束：只算已结束的那 1 场', () => {
    expect(demoReportStats({ proxyDone: false, progress: 0, avgManualMin: 20 }).chats).toBe(1)
  })

  it('回报开场白的数字跟统计一致', () => {
    const s = demoReportStats({ proxyDone: true, progress: 1, avgManualMin: 20 })
    const lead = reportLead(s)
    expect(lead).toContain(`筛了 ${s.screened} 个人`)
    expect(lead).toContain(`代聊了 ${s.chats} 场`)
    expect(lead).toContain(`有 ${s.fit} 个`)
  })

  it('还没有合适的人：不会说「有 0 个跟你很合」', () => {
    const lead = reportLead(demoReportStats({ proxyDone: true, progress: 0, avgManualMin: 20 }))
    expect(lead).not.toContain('有 0 个')
  })
})
