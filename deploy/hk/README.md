# 部署到香港主機（讓中國大陸用戶能用）

為什麼：`vercel.app` 在大陸被擋，瀏覽器直接連 Supabase 也不穩。搬到香港主機＋自己的網域後：
- 網頁、API、Supabase（登入、聊天即時更新）全部走同一個網域，大陸用戶只要連得到香港就能用。
- worker 也放在這台主機 24 小時跑，不用再開自己的電腦。
- 香港機房不需要 ICP 備案。

Vercel 版本可以繼續留著（給海外用），兩邊用同一個 Supabase 資料庫。**worker 只能開一個：香港主機開著，就不要在自己電腦開 `npm run worker`。**

---

## 1. 買網域

- 建議在 Cloudflare Registrar 或 Namecheap 買 `.com`（一年約 10 美元，不需要中國實名）。
- 只當 DNS 用：**不要開 Cloudflare 的橘色雲朵（代理）**，大陸連 Cloudflare 代理反而慢。

## 2. 買香港主機

騰訊雲國際站（intl.cloud.tencent.com）→ Lighthouse 輕量應用伺服器：
- 地區：**中國香港**
- 映像：**Ubuntu 22.04 或 24.04**
- 規格：2 核 2GB 以上
- 買好後在主機的「防火牆」開放 **22、80、443** 三個端口。
- 記下主機的**公網 IP**。

## 3. 網域指向主機

在買網域的地方新增一筆 DNS：
- 類型 `A`，名稱 `@`，值＝主機公網 IP（Cloudflare 要選「僅 DNS」灰色雲朵）
- 等 1～10 分鐘，在自己電腦執行 `ping 你的網域`，看到的 IP 是主機的就對了。

## 4. 登入主機、執行安裝

騰訊雲控制台按「登入」（瀏覽器版終端機）或用 SSH，然後：

```bash
sudo -i
curl -fsSL https://raw.githubusercontent.com/WEICHENG28/PersonaAI/main/deploy/hk/setup.sh -o setup.sh
bash setup.sh 你的網域 https://gsmxbgcftiwnqrduryuf.supabase.co
```

## 5. 放金鑰（只有你自己做）

```bash
nano /srv/personaai/.env.local
```

把自己電腦上 `.env.local` 的內容整份貼上，`Ctrl+O` 存檔、`Ctrl+X` 離開。值不要加引號。

## 6. 部署

```bash
cd /srv/personaai
bash deploy/hk/deploy.sh 你的網域
```

## 7. 檢查

```bash
curl https://你的網域/api/health/deep
```

- `database` 和 `llm` 都是 `ok` 就成功了。
- `llm` 不是 `ok`：你用的 AI 平台可能不服務香港（例如 OpenAI 官方），要換平台或改用其他地區主機。
- 用手機（關掉 VPN）打開 `https://你的網域`，走一次登入和聊天。

## 之後更新網站

main 有新東西時，登入主機跑：

```bash
cd /srv/personaai && bash deploy/hk/deploy.sh 你的網域
```

## 常用指令

| 要做什麼 | 指令 |
|---|---|
| 看後端／worker 狀態 | `pm2 status` |
| 看後端紀錄 | `pm2 logs personaai-server --lines 100` |
| 看 worker 紀錄 | `pm2 logs personaai-worker --lines 100` |
| 暫停 worker（要在自己電腦開時） | `pm2 stop personaai-worker` |
| 重新開 worker | `pm2 start personaai-worker` |
| 看網站設定有沒有錯 | `caddy validate --config /etc/caddy/Caddyfile` |
