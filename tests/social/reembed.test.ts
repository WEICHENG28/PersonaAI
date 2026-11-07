import { expect, it, vi } from 'vitest'
import { reembedAll } from '../../scripts/reembed-lib.js'
const profile = { intro: '测试', interests: ['登山'], chat_style: '短句', looking_for: '朋友' }
function deps() {
  return { list: async () => [1, 2, 3].map(n => ({ userId: String(n), shareable: profile })),
    embed: vi.fn(async (_text: string) => [1, 2]), save: vi.fn(async () => {}), log: vi.fn() }
}
it('dry-run never embeds or saves', async () => {
  const d = deps(); const result = await reembedAll(d, { apply: false, concurrency: 2, expectedDim: 2 })
  expect(result).toEqual({ total: 3, updated: 0, failed: [] })
  expect(d.embed).not.toHaveBeenCalled(); expect(d.save).not.toHaveBeenCalled()
})
it('applies each profile using shared profile text and continues after invalid dimensions', async () => {
  const d = deps(); d.embed.mockResolvedValueOnce([1])
  const result = await reembedAll(d, { apply: true, concurrency: 1, expectedDim: 2 })
  expect(result).toEqual({ total: 3, updated: 2, failed: ['1'] })
  expect(d.embed.mock.calls[0]?.[0]).toContain('兴趣：登山')
  expect(d.save).toHaveBeenCalledTimes(2)
})
it('continues after embedding and saving errors without logging provider text', async () => {
  const d = deps(); d.embed.mockRejectedValueOnce(new Error('secret'))
  d.save.mockRejectedValueOnce(new Error('private'))
  expect(await reembedAll(d, { apply: true, concurrency: 1, expectedDim: 2 }))
    .toEqual({ total: 3, updated: 1, failed: ['1', '2'] })
  expect(JSON.stringify(d.log.mock.calls)).not.toMatch(/secret|private/)
})

it('limits concurrency and rejects non-finite vectors', async () => {
  const d = deps(); let running = 0; let peak = 0
  d.embed.mockImplementation(async () => {
    running++; peak = Math.max(peak, running)
    await Promise.resolve(); running--
    return [NaN, 2]
  })
  const result = await reembedAll(d, { apply: true, concurrency: 2, expectedDim: 2 })
  expect(peak).toBe(2); expect(result.failed).toHaveLength(3)
  expect(d.save).not.toHaveBeenCalled()
})
it.each([0, -1, 1.5])('rejects invalid concurrency %s before listing', async concurrency => {
  const d = deps(); const list = vi.fn(d.list)
  await expect(reembedAll({ ...d, list }, { apply: true, concurrency, expectedDim: 2 })).rejects.toThrow()
  expect(list).not.toHaveBeenCalled()
})
