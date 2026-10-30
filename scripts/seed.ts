// npm run seed：把 server/fixtures/seed-users.ts 的 10 位種子用戶寫進 Supabase（docs/07C C0）。擁有者：C。
// ⚠️ 會先刪除所有舊的種子用戶。三人共用資料庫：只由 C 執行，跑之前先在群組說（docs/07 第 0.8 節）。
import type { SupabaseClient } from '@supabase/supabase-js'
import { existsSync } from 'node:fs'
import { embed } from '../server/lib/llm'
import { getServiceClient } from '../server/lib/supabase'
import { runSeed, type SeedDb } from '../server/twin/seed'

const FK_VIOLATION = '23503'

function supabaseSeedDb(db: SupabaseClient): SeedDb {
  return {
    async deleteSeedUsers() {
      const { data, error } = await db.from('users').delete().eq('is_seed', true).select('id')
      if (error?.code === FK_VIOLATION) {
        throw new Error(`舊的種子用戶還被其他資料引用（例如 conversations、match_attempts），無法刪除：${error.message}。請先在群組確認要不要清掉相關資料。`)
      }
      if (error) throw new Error(`刪除舊的種子用戶失敗：${error.message}`)
      return data.length
    },
    async insertUser(row) {
      const { data, error } = await db.from('users').insert(row).select('id').single()
      if (error) throw new Error(`寫入 users（${row.display_name}）失敗：${error.message}`)
      return data.id as string
    },
    async insertProfile(row) {
      // pgvector 接受 '[1,2,3]' 格式的字串
      const { error } = await db.from('user_profiles').insert({ ...row, embedding: JSON.stringify(row.embedding) })
      if (error) throw new Error(`寫入 user_profiles（${row.user_id}）失敗：${error.message}`)
    },
  }
}

async function main(): Promise<void> {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local')
  const summary = await runSeed(supabaseSeedDb(getServiceClient()), embed)
  const lines = summary.inserted.map((u) => `  ${u.display_name}（${u.key}）→ ${u.user_id}`)
  process.stdout.write(`[seed] 刪除舊的種子用戶 ${summary.deleted} 位，新增 ${summary.inserted.length} 位：\n${lines.join('\n')}\n`)
}

main().catch((err: unknown) => {
  process.stderr.write(`[seed] 失敗：${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
