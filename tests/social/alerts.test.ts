import { afterEach, describe, expect, it, vi } from 'vitest'
import { recentErrors, recordError, resetAlertsForTest, shouldAlert, webhookPayload } from '../../server/lib/alerts'

afterEach(() => {
  resetAlertsForTest()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('錯誤監測', () => {
  it('同一個錯誤合併計數，新的在前，最多記 50 種', () => {
    recordError('server', 'POST /api/tasks', new Error('boom'), 1)
    recordError('server', 'POST /api/tasks', new Error('boom'), 2)
    recordError('web', '/friend', 'x is undefined', 3)
    const list = recentErrors()
    expect(list.map((e) => [e.source, e.message, e.count])).toEqual([
      ['web', 'x is undefined', 1],
      ['server', 'boom', 2],
    ])
    for (let i = 0; i < 60; i++) recordError('server', 'w', `err ${i}`, 10 + i)
    expect(recentErrors()).toHaveLength(50)
  })

  it('推通知：同一錯誤 10 分鐘一次、每小時最多 20 則', () => {
    expect(shouldAlert('a', 0)).toBe(true)
    expect(shouldAlert('a', 60_000)).toBe(false)
    expect(shouldAlert('a', 11 * 60_000)).toBe(true)
    resetAlertsForTest()
    const sent = Array.from({ length: 25 }, (_, i) => shouldAlert(`k${i}`, i)).filter(Boolean)
    expect(sent).toHaveLength(20)
    expect(shouldAlert('later', 61 * 60_000)).toBe(true)
  })

  it('各平台的機器人格式', () => {
    expect(webhookPayload('feishu', 'hi')).toEqual({ msg_type: 'text', content: { text: 'hi' } })
    expect(webhookPayload('wecom', 'hi')).toEqual({ msgtype: 'text', text: { content: 'hi' } })
    expect(webhookPayload('discord', 'hi')).toEqual({ content: 'hi' })
    expect(webhookPayload('slack', 'hi')).toEqual({ text: 'hi' })
  })

  it('有設 ALERT_WEBHOOK_URL 才推，內容有來源、位置和錯誤訊息', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', fetchMock)
    recordError('server', 'a', 'no url yet', 1)
    expect(fetchMock).not.toHaveBeenCalled()
    vi.stubEnv('ALERT_WEBHOOK_URL', 'https://example.com/hook')
    vi.stubEnv('ALERT_WEBHOOK_KIND', 'feishu')
    recordError('worker', '推进任务', new Error('timeout'), 2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string)
    expect(body.content.text).toContain('worker｜推进任务')
    expect(body.content.text).toContain('timeout')
  })
})
