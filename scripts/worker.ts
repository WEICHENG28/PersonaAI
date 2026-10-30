/**
 * Agent 背景迴圈（B3 交付）— stub。
 *
 * ⚠️ 三人共用資料庫：worker 會撈同一張 agent_tasks，同時開會搶任務。
 * 啟動前先在群組確認沒有人在跑（AGENTS.md §7）。
 */
async function main() {
  console.log('[worker] stub：Agent 迴圈尚未實作（B3 交付）。')
}

main().catch((error) => {
  console.error('[worker] fatal:', error)
  process.exit(1)
})
