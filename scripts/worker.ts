// 社交 Agent 背景迴圈（docs/07B 的 B3）：每 WORKER_INTERVAL_MS 檢查 running 任務，
// 同時最多推進 WORKER_CONCURRENCY 個（同一任務不會重疊），現場多人交辦任務時不用排隊。
// 三人共用資料庫，同一時間只開一個 worker（07 第 0.8 節）；開之前先在群組說。用 Ctrl+C 停止。
import { existsSync } from 'node:fs'
import { CONFIG } from '../server/lib/config'
import { getAgentStore } from '../server/social/agentStore'
import { runTaskStepSafely } from '../server/social/runner'
import { defaultRunnerDeps } from '../server/social/runnerDeps'
import { createWorkerPool } from '../server/social/workerPool'
import { cleanupGuests, supabaseGuestCleanupDeps } from '../server/account/guestCleanup'
import { recordError } from '../server/lib/alerts'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const pool = createWorkerPool({
  listRunning: () => getAgentStore().listRunningTaskIds(),
  runStep: (id) => runTaskStepSafely(id, defaultRunnerDeps()),
  concurrency: CONFIG.WORKER_CONCURRENCY,
  log: (id, outcome) => console.log(`[worker] ${new Date().toLocaleTimeString()} ${id} → ${outcome}`),
  onError: (id, err) => {
    console.error(`[worker] ${id} 这一步失败，下一轮再试`, err)
    recordError('worker', '推进任务', err)
  },
})

// 游客帳號到期刪除：Vercel Cron 每天一次，worker 開著時再每 6 小時補跑
const CLEANUP_EVERY_MS = 6 * 60 * 60 * 1000
let lastCleanup = 0
async function maybeCleanupGuests(): Promise<void> {
  if (Date.now() - lastCleanup < CLEANUP_EVERY_MS) return
  lastCleanup = Date.now()
  try {
    const r = await cleanupGuests(supabaseGuestCleanupDeps())
    if (r.deleted || r.failed) console.log(`[worker] 清理到期游客：删除 ${r.deleted} 个，失败 ${r.failed} 个`)
  } catch (err) {
    console.error('[worker] 清理游客失败，6 小时后再试', err)
  }
}

async function loop(): Promise<void> {
  console.log(
    `[worker] 启动，每 ${CONFIG.WORKER_INTERVAL_MS / 1000} 秒检查一次 running 任务，同时最多推进 ${CONFIG.WORKER_CONCURRENCY} 个`,
  )
  for (;;) {
    try {
      await pool.tick()
      void maybeCleanupGuests()
    } catch (err) {
      console.error('[worker] 读取任务失败，下一轮再试', err)
      recordError('worker', '读取任务', err)
    }
    await new Promise((r) => setTimeout(r, CONFIG.WORKER_INTERVAL_MS))
  }
}

void loop()
