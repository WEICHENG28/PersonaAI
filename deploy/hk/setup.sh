#!/usr/bin/env bash
# PersonaAI 香港主機「第一次」安裝（Ubuntu 22.04 / 24.04，用 root 執行）。
# 用法：sudo bash setup.sh 你的網域 https://你的專案.supabase.co
#   例：sudo bash setup.sh personaai.com https://gsmxbgcftiwnqrduryuf.supabase.co
# 會做：加 2G swap、裝 Node 22／git／Caddy／pm2、下載程式到 /srv/personaai、設定 Caddy。
# 不會做：建立 .env.local（金鑰要你自己貼，見 README 第 5 步）。
set -euo pipefail

DOMAIN="${1:?請給網域，例如 personaai.com}"
SUPABASE_URL="${2:?請給 Supabase 網址，例如 https://xxxx.supabase.co}"
REPO="https://github.com/WEICHENG28/PersonaAI.git"
APP=/srv/personaai

echo "== 1/5 加 2G swap（2G 記憶體的主機 build 時才不會不夠）"
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== 2/5 安裝 Node.js 22、git"
apt-get update -y
apt-get install -y curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https
if ! command -v node >/dev/null || ! node -v | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "== 3/5 安裝 Caddy（自動 HTTPS）"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

echo "== 4/5 安裝 pm2、下載程式"
npm install -g pm2
if [ ! -d "$APP/.git" ]; then
  git clone "$REPO" "$APP"
fi

echo "== 5/5 設定 Caddy"
sed -e "s#__DOMAIN__#${DOMAIN}#g" -e "s#__SUPABASE_URL__#${SUPABASE_URL}#g" "$APP/deploy/hk/Caddyfile.template" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl enable caddy
systemctl reload caddy || systemctl restart caddy

cat <<MSG

安裝完成。下一步（README 第 5、6 步）：
  1. nano $APP/.env.local   ← 把你電腦上 .env.local 的內容貼進去（不要給別人看）
  2. cd $APP && bash deploy/hk/deploy.sh ${DOMAIN}
MSG
