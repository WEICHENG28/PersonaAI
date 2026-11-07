// 手动维护工具：默认只预览；--apply 会调用平台并写入共享资料库。
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { reembedAll } from './reembed-lib.js'
import type { ShareableProfile } from '../shared/types.js'

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.includes('--help')) {
    console.log('用法：tsx scripts/reembed.ts [--apply] [--concurrency N]；默认只预览，不调用模型、不写入')
    return
  }
  let apply = false
  let concurrency = 1
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') apply = true
    else if (args[i] === '--concurrency') concurrency = Number(args[++i])
    else throw new Error('未知参数')
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10) throw new Error('并行数必须为 1–10')
  if (existsSync('.env.local')) process.loadEnvFile('.env.local')
  const { getServiceClient } = await import('../server/lib/supabase.js')
  const { embed } = await import('../server/lib/llm/index.js')
  const expectedDim = Number(process.env.EMBEDDING_DIM)
  if (!Number.isInteger(expectedDim) || expectedDim < 1) throw new Error('EMBEDDING_DIM 无效')
  const db = getServiceClient()
  const result = await reembedAll({
    async list() {
      const rows: { userId: string; shareable: ShareableProfile }[] = []
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await db.from('user_profiles').select('user_id, shareable_profile')
          .not('shareable_profile', 'is', null).order('user_id').range(offset, offset + 999)
        if (error) throw new Error('读取档案失败')
        rows.push(...(data ?? []).map(row => ({ userId: row.user_id as string, shareable: row.shareable_profile as ShareableProfile })))
        if (!data || data.length < 1000) return rows
      }
    },
    embed: text => embed(text, 'bg'),
    async save(userId, vector) {
      const { error } = await db.from('user_profiles').update({ embedding: JSON.stringify(vector) }).eq('user_id', userId)
      if (error) throw new Error('保存向量失败')
    },
    log: message => console.log(message),
  }, { apply, concurrency, expectedDim })
  console.log(`档案 ${result.total}；更新 ${result.updated}；失败 ${result.failed.length}`)
  if (result.failed.length) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('向量重算失败，请检查配置与连接'); process.exitCode = 1 })
}
