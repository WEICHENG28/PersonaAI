import type { ShareableProfile } from '../shared/types.js'
import { shareableToText } from '../server/friend/profile.js'

export interface ReembedDeps {
  list(): Promise<{ userId: string; shareable: ShareableProfile }[]>
  embed(text: string): Promise<number[]>
  save(userId: string, vector: number[]): Promise<void>
  log(message: string): void
}

/** Dry-run 只读清单，不产生平台调用；apply 才重算并保存。 */
export async function reembedAll(deps: ReembedDeps, opts: {
  apply: boolean; concurrency: number; expectedDim: number
}): Promise<{ total: number; updated: number; failed: string[] }> {
  if (!Number.isInteger(opts.concurrency) || opts.concurrency < 1
      || !Number.isInteger(opts.expectedDim) || opts.expectedDim < 1) throw new Error('重算参数无效')
  const rows = await deps.list()
  const result = { total: rows.length, updated: 0, failed: [] as string[] }
  if (!opts.apply) { deps.log(`预览：${rows.length} 笔档案，不调用模型、不写入`); return result }
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(opts.concurrency, rows.length) }, async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++]!
      try {
        const vector = await deps.embed(shareableToText(row.shareable))
        if (vector.length !== opts.expectedDim || !vector.every(Number.isFinite)) throw new Error('向量维度无效')
        await deps.save(row.userId, vector)
        result.updated++
      } catch {
        result.failed.push(row.userId)
        deps.log('档案向量更新失败，继续下一笔')
      }
    }
  }))
  return result
}
