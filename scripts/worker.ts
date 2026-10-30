// 社交 Agent 背景迴圈（docs/07B 的 B3）：每 WORKER_INTERVAL_MS 推進所有 running 任務一步。
// 三人共用資料庫，同一時間只開一個 worker（07 第 0.8 節）；開之前先在群組說。用 Ctrl+C 停止。
import { existsSync } from 'node:fs'
import { CONFIG } from '../server/lib/config'
import { getAgentStore } from '../server/social/agentStore'
import { runTaskStepSafely } from '../server/social/runner'
import { defaultRunnerDeps } from '../server/social/runnerDeps'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const inFlight = new Set<string>()

async function tick(): Promise<void> {
  const ids = await getAgentStore().listRunningTaskIds()
  for (const id of ids) {
    // 同一任務上一步還沒跑完就跳過
    if (inFlight.has(id)) continue
    inFlight.add(id)
    try {
      const outcome = await runTaskStepSafely(id, defaultRunnerDeps())
      console.log(`[worker] ${new Date().toLocaleTimeString()} ${id} → ${outcome}`)
    } finally {
      inFlight.delete(id)
    }
  }
}

async function loop(): Promise<void> {
  console.log(`[worker] 启动，每 ${CONFIG.WORKER_INTERVAL_MS / 1000} 秒推进一次 running 任务`)
  for (;;) {
    try {
      await tick()
    } catch (err) {
      console.error('[worker] 读取任务失败，下一轮再试', err)
    }
    await new Promise((r) => setTimeout(r, CONFIG.WORKER_INTERVAL_MS))
  }
}

void loop()
