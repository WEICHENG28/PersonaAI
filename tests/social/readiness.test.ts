// 分身／社交 Agent 開始前：只叫用戶去做缺的那一步。
import { describe, expect, it } from 'vitest'
import { notReadyMessage } from '../../server/social/readiness'

describe('notReadyMessage', () => {
  it('都好了回 null', () => {
    expect(notReadyMessage({ socialAgentEnabled: true, shareableConfirmed: true })).toBeNull()
  })
  it('只缺社交 Agent：叫他去設定開，不提我的檔案', () => {
    const m = notReadyMessage({ socialAgentEnabled: false, shareableConfirmed: true })!
    expect(m).toContain('设置')
    expect(m).not.toContain('我的档案')
  })
  it('只缺檔案：叫他去我的檔案', () => {
    const m = notReadyMessage({ socialAgentEnabled: true, shareableConfirmed: false })!
    expect(m).toContain('我的档案')
    expect(m).not.toContain('设置')
  })
  it('兩個都缺：先檔案再設定', () => {
    expect(notReadyMessage({ socialAgentEnabled: false, shareableConfirmed: false }, '，分身才能替你去聊')).toBe(
      '先到「我的档案」确认对外档案，再到「设置」开启社交 Agent，分身才能替你去聊',
    )
  })
})
