/**
 * 種子用戶（C0 交付）— stub。建立 10 位種子用戶（含檔案與向量）。
 *
 * ⚠️ 共用資料庫：`npm run seed` 只由 C 執行；重跑先在群組說（07 §0.8）。
 */
async function main() {
  console.log('[seed] stub：種子用戶尚未實作（C0 交付）。')
}

main().catch((error) => {
  console.error('[seed] fatal:', error)
  process.exit(1)
})
