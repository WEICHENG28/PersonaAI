#!/usr/bin/env bash
# 更新香港主機上的網站（第一次部署、之後每次 main 有新東西都跑這個）。
# 用法：cd /srv/personaai && bash deploy/hk/deploy.sh 你的網域
set -euo pipefail

DOMAIN="${1:?請給網域，例如 personaai.com}"
cd /srv/personaai

if [ ! -f .env.local ]; then
  echo "找不到 .env.local：先 nano .env.local，把金鑰貼進去" >&2
  exit 1
fi

echo "== 1/4 下載最新的 main"
git fetch origin
git checkout main
git reset --hard origin/main   # 這台主機只跑 main，不在這裡改程式

echo "== 2/4 安裝套件"
npm ci

echo "== 3/4 打包前端（Supabase 改走自己網域的 /sb，大陸用戶才連得到）"
# 這裡給的值優先於 .env.local（Vite 規則），其他設定照 .env.local
VITE_API_MODE=http VITE_SUPABASE_URL="https://${DOMAIN}/sb" npm run build

echo "== 4/4 重啟後端與 worker"
pm2 startOrReload deploy/hk/ecosystem.config.cjs
pm2 save
# 第一次才需要：讓主機重開機後自動啟動 pm2
if [ ! -f /etc/systemd/system/pm2-root.service ]; then pm2 startup systemd -u root --hp /root >/dev/null; pm2 save; fi

echo
echo "完成。檢查：curl https://${DOMAIN}/api/health/deep"
