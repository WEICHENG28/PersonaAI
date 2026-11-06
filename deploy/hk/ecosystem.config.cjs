// pm2 設定：在香港主機上常駐兩個程式，當機或重開機會自動重啟。
// - personaai-server：後端 API（只聽 127.0.0.1:8787，由 Caddy 對外）
// - personaai-worker：社交 Agent 背景迴圈（三人共用資料庫，同一時間只能有一個 worker：這台開著，就不要在自己電腦開）
module.exports = {
  apps: [
    {
      name: 'personaai-server',
      cwd: '/srv/personaai',
      script: 'node_modules/.bin/tsx',
      args: 'server/index.ts',
      env: { NODE_ENV: 'production', PORT: '8787' },
      max_memory_restart: '600M',
    },
    {
      name: 'personaai-worker',
      cwd: '/srv/personaai',
      script: 'node_modules/.bin/tsx',
      args: 'scripts/worker.ts',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '600M',
    },
  ],
}
