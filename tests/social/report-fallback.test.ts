// 阿澈回報任務結果：AI 失敗時的固定句子（通知才不會一直卡在未讀）。
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../server/lib/supabase', () => ({ getServiceClient: () => ({}) }))
import { fallbackReportText } from '../../server/friend/nextMeet'

describe('fallbackReportText', () => {
  it('有合適的人：列出名字（含真人／示范用户標示）', () => {
    const text = fallbackReportText({ chats: 4, saved_minutes: 80, suitable: [{ user_id: 'a', display_name: '小安（真人）', mutual: true, conversation_id: 'c' }] })
    expect(text).toContain('代聊了 4 场')
    expect(text).toContain('小安（真人）')
    expect(text).not.toMatch(/\d+ ?分(?!钟)/)
  })
  it('沒有合適的：安慰並建議換條件', () => {
    expect(fallbackReportText({ chats: 6, saved_minutes: 0, suitable: [] })).toContain('换个条件')
  })
})

import { scoreColor } from '../../src/features/twin/components/resultView'

describe('scoreColor', () => {
  it('依區間給顏色：80+ 深綠、65–79 綠、50–64 琥珀橘、50 以下紅', () => {
    expect(scoreColor(92)).toBe('var(--color-success)')
    expect(scoreColor(70)).toBe('var(--color-leaf)')
    expect(scoreColor(51)).toBe('var(--color-accent-deep)')
    expect(scoreColor(30)).toBe('var(--color-error)')
  })
})
