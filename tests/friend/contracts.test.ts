import { describe, expect, it } from 'vitest'
import {
  getAgentProfile,
  getShareableProfile,
  getStyleProfile,
} from '@/lib/contracts/friend'
import { agentProfile, shareableProfile } from '@/fixtures/friend'

/** A0 必測：contracts stub 回傳型別符合 lib/types.ts（B、C 依賴這些簽名）。 */
describe('lib/contracts/friend stub（A0）', () => {
  it('getShareableProfile 回傳 ShareableProfile（不為 null、欄位齊全）', async () => {
    const result = await getShareableProfile('user-1')
    expect(result).not.toBeNull()
    expect(result).toEqual(shareableProfile)
    expect(typeof result?.intro).toBe('string')
    expect(Array.isArray(result?.interests)).toBe(true)
    expect(typeof result?.chat_style).toBe('string')
    expect(typeof result?.looking_for).toBe('string')
  })

  it('getAgentProfile 回傳 AgentProfile（Big Five 五項齊全）', async () => {
    const result = await getAgentProfile('user-1')
    expect(result).not.toBeNull()
    expect(Object.keys(result?.big_five ?? {}).sort()).toEqual(['A', 'C', 'E', 'N', 'O'])
    for (const key of ['O', 'C', 'E', 'A', 'N'] as const) {
      const trait = result?.big_five[key]
      expect(trait!.score).toBeGreaterThanOrEqual(0)
      expect(trait!.score).toBeLessThanOrEqual(100)
      expect(trait!.confidence).toBeGreaterThanOrEqual(0)
      expect(trait!.confidence).toBeLessThanOrEqual(1)
    }
    expect(result?.style).toBeDefined()
  })

  it('getStyleProfile 只回風格（StyleProfile 欄位）', async () => {
    const result = await getStyleProfile('user-1')
    expect(result).not.toBeNull()
    expect(['short', 'medium', 'long']).toContain(result!.sentence_length)
    expect(['casual', 'neutral', 'formal']).toContain(result!.formality)
    expect([0, 1, 2, 3]).toContain(result!.emoji_level)
  })

  it('fixtures 與 types 一致：agentProfile.style 即 getStyleProfile 的來源', async () => {
    const style = await getStyleProfile('user-1')
    expect(style).toEqual(agentProfile.style)
  })
})
