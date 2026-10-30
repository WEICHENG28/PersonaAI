import { describe, expect, it } from 'vitest'
import { app } from '../../server/app'
import { searchLobby } from '../../server/contracts/social'
import { getShareableProfile } from '../../server/contracts/friend'
import { getTranscript } from '../../server/contracts/twin'

describe('S0 後端骨架', () => {
  it('GET /api/health 回 ok', async () => {
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, data: { status: 'ok' } })
  })

  it('不存在的接口回 404 與統一錯誤格式', async () => {
    const res = await app.request('/api/nope')
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ ok: false })
  })

  it('三條線的 contracts stub 都能呼叫', async () => {
    expect(await getShareableProfile('u1')).not.toBeNull()
    expect(await searchLobby('u1', { excludeIds: ['seed-lin'] })).toHaveLength(1)
    expect((await getTranscript('c9'))[0]?.conversation_id).toBe('c9')
  })
})
