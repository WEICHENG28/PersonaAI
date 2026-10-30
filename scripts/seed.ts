// npm run seed：把 server/fixtures/seed-users.ts 的 10 位種子用戶寫進 Supabase（docs/07C C0）。擁有者：C。
// 依名字更新現有種子用戶（id 不變）、沒有的才新增；不刪除任何用戶，清單外的舊種子用戶只列出來。
// 會覆蓋種子用戶的檔案、向量，並清掉大廳卡片快取。三人共用資料庫：只由 C 執行，跑之前先在群組說（docs/07 第 0.8 節）。
import type { SupabaseClient } from '@supabase/supabase-js'
import { existsSync } from 'node:fs'
import { embed } from '../server/lib/llm'
import { getServiceClient } from '../server/lib/supabase'
import { runSeed, type SeedDb, type SeedSummary } from '../server/twin/seed'

function supabaseSeedDb(db: SupabaseClient): SeedDb {
  return {
    async listSeedUsers() {
      const { data, error } = await db.from('users').select('id, display_name').eq('is_seed', true)
      if (error) throw new Error(`讀取現有種子用戶失敗：${error.message}`)
      return data as { id: string; display_name: string }[]
    },
    async updateUser(id, patch) {
      const { error } = await db.from('users').update(patch).eq('id', id).eq('is_seed', true)
      if (error) throw new Error(`更新 users（${id}）失敗：${error.message}`)
    },
    async insertUser(row) {
      const { data, error } = await db.from('users').insert(row).select('id').single()
      if (error) throw new Error(`寫入 users（${row.display_name}）失敗：${error.message}`)
      return data.id as string
    },
    async upsertProfile(row) {
      // pgvector 接受 '[1,2,3]' 格式的字串
      const { error } = await db
        .from('user_profiles')
        .upsert({ ...row, embedding: JSON.stringify(row.embedding) }, { onConflict: 'user_id' })
      if (error) throw new Error(`寫入 user_profiles（${row.user_id}）失敗：${error.message}`)
    },
  }
}

function report(summary: SeedSummary): string {
  const line = (u: { display_name: string; user_id: string }) => `  ${u.display_name} → ${u.user_id}`
  const parts = [
    `[seed] 更新 ${summary.updated.length} 位、新增 ${summary.inserted.length} 位`,
    ...(summary.updated.length ? ['更新：', ...summary.updated.map(line)] : []),
    ...(summary.inserted.length ? ['新增：', ...summary.inserted.map(line)] : []),
    ...(summary.untouched.length ? ['不在清單裡的舊種子用戶（沒有刪除）：', ...summary.untouched.map(line)] : []),
  ]
  return `${parts.join('\n')}\n`
}

async function main(): Promise<void> {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local')
  const summary = await runSeed(supabaseSeedDb(getServiceClient()), embed)
  process.stdout.write(report(summary))
}

main().catch((err: unknown) => {
  process.stderr.write(`[seed] 失敗：${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
