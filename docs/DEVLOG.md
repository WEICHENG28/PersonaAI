# PersonaAI 開發紀錄（DEVLOG）

> **所有人、所有 AI 做的每一件事都記在這裡**，方便之後維護、交接和寫簡報。
> 規格看 `docs/01`～`07`；這份記的是「實際做了什麼、為什麼、踩了什麼坑」。

## 怎麼記

- **每個 PR 都要附一筆紀錄**，和程式碼放在同一個 PR 裡（PR 範本有勾選項）。
- **只寫在自己那條線的區塊**，新的一筆放在該區塊**最上面**。三條線各寫各的區塊，就不會互相衝突。
  在自己區塊新增紀錄不算改共用檔，不需要別人 review。
- 跨線的決定（改型別、改契約、改流程、換模型）寫在「共用與決策」，寫的人是提出的人。
- 寫給半年後完全忘記細節的自己看：**為什麼這樣做**比做了什麼更重要。

### 格式

```markdown
### 2026-10-30｜B3 Agent 迴圈與 worker｜Peter｜PR #40
- **做了什麼**：一兩句話。
- **為什麼這樣做**：做的決定與原因；考慮過但沒採用的做法。
- **改了哪些檔案**：主要檔案就好。
- **踩到的坑／注意事項**：之後維護的人要知道的事（沒有就寫「無」）。
- **還沒做完／待辦**：沒有就寫「無」。
```

---

## 共用與決策

### 2026-10-30｜落地頁大改版：Hero 留白＋Rive 三角＋細節區擴充｜Vincent（AI 協助）｜直接 commit main（骨架階段）
- **做了什麼**：`LandingPage.tsx` 全面擴寫 — hero 副標新增；三角色卡各配 Rive（robot/fish/birdie，96px）取代 emoji；每張角色卡加 3 條清單式細節；新增三個 detail section（判定檔位、記憶掌控、大廳導覽，各 3 張小卡）；flow/stats/CTA 補副標。`landing.css`：hero `line-height: 1.06→1.35`、`margin-block: var(--space-xl)`、`padding-block: 2xl/3xl`（上下大留白）；新增 `.landing-sec__sub`、`.role-card__list`（accent 圓點）、`.detail-card`（radius-stock）樣式。
- **為什麼**：使用者要求標題垂直間距加大、首區上下留白、內容大幅擴充但每格保持精簡（1-2 短句）、禁 emoji 改用三個 Rive。
- **驗證**：tsc 通過；headless 1440px 截圖確認三 Rive 卡、留白與新 detail 區正常。
- **坑**：無。

### 2026-10-30｜新增 09 Agent 數據結構文件｜Vincent（AI 協助）｜直接 commit main（骨架階段）
- **做了什麼**：新增 `docs/09_Agent數據結構.md`：5 個無狀態 Agent 的 JSON 狀態結構藍圖 — user_memory（興趣＋信心＋權重＋證據指標）、user_memory_view（它記得的事·只讀視圖）、shareable_profile（信封式衍生的大廳卡片）、agent_profile/task/chat_session/match_result/agent_log，附信心值五規則、權重規則、每 Agent 的讀寫契約表。
- **為什麼**：使用者要的後端記憶形態（JSON 檔、信心度＋權重、可視結構、AI 衍生對外檔案）需要一份單一文檔讓後端與各線 AI 直接抄結構；兩個方案經 MC 確認：信封式對外更新、AI 自動推導權重、每 5 則整合。
- **改了哪些檔案**：僅新增此文件，零代碼改動。

---

### 2026-10-30｜A0 後架構調整｜Peter（AI 協助）
- **做了什麼**：新增 `docs/10_A0後架構調整.md`：保留 A0 的 Vite SPA，另加 `server/`（Node＋Hono）放 LLM 與 Supabase 寫入；07 系列路徑換算表、新檔案歸屬、新 M1（S0 後端骨架→A0b 真實登入／B0／C0）。把 A0 放錯資料夾的頁面搬到擁有者資料夾（Profile/Settings→friend、History→social、ProxyChat/Result/Handoff→twin），只改 `src/routes.tsx` 的 import。07、07A/B/C 頂部加註以 10 為準；AGENTS、CONTRIBUTING、README 同步。
- **為什麼這樣做**：A0 改成純前端 SPA，沒有地方安全放 LLM 金鑰和 service role key，Agent 賽道的核心（規劃、判定、worker）需要後端；改回 Next.js 會丟掉 A 已做好的全部畫面，所以加後端而不是重做。頁面依歸屬搬家，避免 AI 依資料夾名稱改錯別人的檔案。
- **驗證**：`tsc -b` 通過、vitest 4/4、`npm run build` 成功。
- **注意**：A0 是直接 commit 到 main，違反規則；`main` 分支保護需要 Peter 在 GitHub 設定。
- **還沒做完／待辦**：介面語言（簡體 vs 繁體）待三人決定；S0 由 B 做。

---

### 2026-10-30｜卡片內距修復＋寬屏展開＋雙欄｜Vincent（AI 協助）｜直接 commit main（骨架階段）
- **做了什麼**：`.card` 統一 `padding: 24px`（此前無 padding，CardHead 標題貼容器邊緣）；桌機 `--container` 展開至近全窗（min(100vw-80px, 1600px)）、landing 用 1760px 寬版；AI 朋友／我的檔案／設置頁改桌機雙欄；設置頁右欄新增「賬號·登出」卡；設計規範 md 補 Hum 鐵則（第 0 節）與布局規則。
- **為什麼**：使用者回報側欄卡內容貼邊（候選人卡因自帶 padding 無此問題）→ 根因是 `.card` 基類缺 padding；寬屏需求＝資訊頁展開、內容頁雙欄消化寬度。
- **驗證**：tsc、vitest 4/4；CDP 1440/375px 實測 friend/profile/settings/lobby：雙欄生效、卡片 24px 內距、零溢出。
- **坑**：pages.css 在 base.css 之後導入，`.cand-card` 等自帶 padding 的卡不受影響（選擇器同級後者勝）；`.friend-chat` 顯式 `padding: 0` 保留分區排版。

---

### 2026-10-30｜全站統一頂欄＋設計規範文件｜Vincent（AI 協助）｜直接 commit main（骨架階段）
- **做了什麼**：頂欄改為每頁都有（含 landing、登入）、sticky＋滾動加深陰影（drop-shadow，撕紙 clip-path 裁不掉）；登入後右端加 Profile 鈕（頭像圓片＋暱稱）、未登入顯示梨黃「開始使用」CTA；登入頁短內容垂直置中（`app-main.page-center`）；landing 移除自帶頂欄；手機底攔第 4 格加「我的檔案」。新增 `docs/08_前端設計規範.md`（Agent 改 UI 前必讀：頂欄結構、居中規則、Rive 語義鍵、驗證口徑）。
- **為什麼**：對齊直覺與 Hum demo 參考——同一頂欄出現在所有頁面、滾動時貼頂有影子；短頁置中；登入前後都有明確入口。
- **驗證**：tsc 過；vitest 4/4；CDP 抽測 375/1280px × landing/login/friend/profile/lobby：topbar 全站存在、sticky、滾動陰影、CTA/Profile 按狀態切換、零橫向溢出、登入卡置中。
- **待辦**：手機底攔 5→4 格（profile 併入），檢查 56px 觸控目標仍達標。

---

### 2026-10-30｜Rive 檔名重接｜Vincent（AI 協助）｜直接 commit main（骨架階段）
- **做了什麼**：使用者更名 `public/riv/`（robot→clover_bot、fish→fish_vase），`RiveAvatar.tsx` 的 SOURCES 重接新檔名。
- **為什麼**：舊路徑被 Vite SPA fallback 吃掉回傳 HTML，頭像 404 掛掉；三個新檔內部都有 `State Machine 1`，runtime 設定不用改。
- **驗證**：tsc 過；HTTP 實測新檔回 RIVE magic bytes、舊檔回 HTML。

---

### 2026-10-30｜Vite SPA 重構（02 全流程可點）＋導航/落地頁修正｜Vincent（AI 協助）｜直接 commit main（骨架階段）
- **做了什麼**：把 Next.js SSR 骨架整個換成 Vite 6 + React 19 SPA（TS strict、Tailwind v4、Zustand demo 引擎、零後端依賴），02 的 12 步流程全可點；本次修正容器排版（卡片 box-sizing、grid min-width:0、防橫向溢出）、導航響應式（≥64rem 頂欄 nav；手機極簡頂欄 wordmark＋阿澈鈕、底部 Hum 卡紙 tab 拖攔）、新增 `/landing` 落地頁（點頂欄 PersonaAI wordmark 進入，less wordy、Hum 構成：settled hero、卡紙角色卡、撕紙流程帶、梨黃數字 field）。
- **為什麼這樣做**：demo 階段 UI 呈現優先，客戶端模擬最快可跑；保留 `lib/api` 型別+MockApi 縫隙之後接真後端。單語 zh-CN（使用者決定 scrap 多語）。
- **改了哪些檔案**：`src/routes.tsx`、`src/components/AppShell.tsx`、`src/components/ui/NavBar.tsx`、`src/features/landing/LandingPage.tsx`（新）、`src/theme/{layout,landing,pages,base}.css`。
- **驗證**：`tsc -b` 通過、vitest 4/4、`npm run build` 成功；headless Chrome CDP 於 375/768/1280px 實測六頁面：導航切換正確（手機 tabbar flex／桌機 knobs flex）、零橫向溢出、tabbar 貼底（y=752 h=60 @375×812）；瀏覽器 walkthrough 登入→聊天→記憶抽取→任務卡→大廳→歷史全通。
- **踩到的坑**：這台機器 `--headless=new` 會靜默 crash，要用舊 `--headless`；vite 只聽 IPv6 `[::1]`，curl 127.0.0.1 會失敗；`.knobs` 在 media query 前後重複定義會蓋掉（同 specificity 後者勝），已去重。
- **還沒做完／待辦**：bundle 743kB（Rive+React），之後 manualChunks 或 route-level code splitting；登入沒有持久化（重整即登出，demo 可接受）。

---

### 2026-10-30｜A0 加入三語 i18n、Rive 動畫與兩個新套件｜Vincent（AI 協助）｜直接 commit main（骨架階段）
- **做了什麼**：A0 骨架在 07 §3 的結構上擴充三項：全站三語（zh-CN 預設、zh-HK 粵語、en）、三個 Rive 動畫（`public/riv/`：robot=friends 頁頭像、fish=大廳、red_birdie=登入頁）、新增套件 `next-intl`、`@rive-app/react-canvas`。
- **為什麼這樣做**：頁面結構因此從 `app/friend/...` 改為 `app/[locale]/friend/...`（07 §3 的字面路徑位移一層，檔案歸屬不變）；zh-CN 走無前綴 URL（`/friend`），zh-HK／en 走 `/zh-HK/...`、`/en/...`。介面文字改走 `messages/*.json`，取代 07 §7.9 的「介面文字用繁體中文」——這是規格變更，之後補進 02／07 文件。
- **給 B、C**：`lib/contracts/social.ts`、`lib/contracts/twin.ts`、`lib/llm/`、`lib/log.ts`、`scripts/worker.ts`、`scripts/seed.ts` 已有正確簽名的 stub＋fixtures，請直接改寫內部；頁面要拿翻譯文字一律 `useTranslations()`／`getTranslations()`，不要硬編文字。
- **還沒做完／待辦**：Hum token 數值是主題頁的近似值，正式 skill 檔安裝後可比對微調；Chillax 字型檔尚未放入（後備 Noto Sans 已生效）。

---

### 2026-10-30｜README 與進度追蹤｜Peter
- **做了什麼**：新增 `README.md`（新成員開工步驟、進度在哪看、文件索引）；新增 `.github/scripts/task.sh`，AI 開工／卡住／完成時自動更新 Issue 留言與看板狀態；AGENTS.md 規定開工就開 Draft PR 並寫 `Closes #`；建立 GitHub Projects 進度看板。
- **為什麼這樣做**：讓 Peter 和大家上 GitHub 就看得到每個人做到哪，不用在群組問；PR 合併時 Issue 自動關閉、看板自動移到 Done。
- **踩到的坑／注意事項**：腳本需要 `gh` 有 project 權限（`gh auth refresh -s project`），沒有時 AI 會請使用者手動更新。
- **還沒做完／待辦**：無。

### 2026-10-29｜開發前準備｜Peter｜PR #1、#37
- **做了什麼**：建立 repo 協作規則（`CONTRIBUTING.md`、`AGENTS.md`、`CLAUDE.md`、PR 範本）、放入 01～07 規格文件、開好 A0～C10 共 34 個 Issue。
- **為什麼這樣做**：三個人、多個 AI 同時寫同一個 repo，靠「線別目錄所有權＋`lib/contracts` 介面＋分支/PR」避免互相覆蓋；黑客松時間短，只改自己線的 PR 可以自己合併。
- **重要決定**：
  - 分工：A＝Vincent、B＝Peter、C＝Jerry。
  - A0 不可直接 push main；骨架建在 repo 根目錄。
  - 三人共用一個雲端 Supabase：`db:reset`、migration、`seed`、`worker` 都要先在群組說，AI 不可自行執行（07 第 0.8 節）。
  - 代聊結果改成雙方各自視角的大綱與「為什麼你們合」（`fit_points`），只看得到自己那份（PR #37）。
  - 介面設計使用 Hallmark skill 的 **Hum** 主題（07 第 8 節）。
- **還沒做完／待辦**：模型實測後確定 `MODEL_*`；黑客松實際時長；`CRISIS_RESOURCE` 求助專線。

---

## A：AI 朋友線（Vincent）

### 2026-10-30｜A0b 真實登入與 Supabase｜Vincent（AI 協助）｜分支 a/A0b-real-auth｜Closes #44
- **做了什麼**：前端 `src/lib/supabase.ts`＋`src/lib/api/friend.ts`（`VITE_API_MODE=http|mock`）；LoginPage／Settings 接 Supabase Auth（mock 假登录保留）；后端 `server/lib/{supabase,auth,profile}.ts`、`POST /api/profile/init`（JWT＋users 表幂等）；`tests/friend/auth.test.ts`。
- **为什么**：S0 已合；Jerry C0 Realtime／seed 等 A 的 `server/lib/supabase.ts`（见 #20／#48）。本机 Supabase 开发，不碰云端共用库。
- **改了哪些文件**：`src/lib/supabase.ts`、`src/lib/api/friend.ts`、`LoginPage`、`SettingsPage`、`useDemoStore.login` 可选 id、`server/lib/*`、`server/routes/friend.ts`、`tests/friend/auth.test.ts`、`src/vite-env.d.ts`。
- **验证**：tsc 过；vitest 16/16；本机注册→`profile/init` created:true→再调 created:false→users 有行；Vite `/api` 代理通。
- **坑**：`supabase status -o env` 的值带引号，写进 `.env.local` 会导致 PostgREST「No suitable key」；service_role JWT 必须与 status 完全一致。`.env.local` 不 commit。`VITE_API_MODE=http` 会让 vitest 里 B 的 mock API 测打挂 → `vitest.config.ts` 强制 `VITE_API_MODE=mock`。
- **待办**：云端 Supabase 专案（三人共用）仍需手动建；本机验 http 时临时把 `.env.local` 的 `VITE_API_MODE` 改成 `http`。

### 2026-10-30｜A0 專案骨架、登入、共用元件、設計 token｜Vincent（AI 協助）｜直接 commit main（骨架階段）
- **做了什麼**：Next.js 14（App Router、TS strict、Tailwind）專案骨架：登入／註冊（Supabase Auth＋`/api/profile/init` 冪等初始化三張表）、`middleware.ts`（next-intl＋Supabase session＋未登入導向）、Hum 主題 token 寫入 `app/globals.css`（含深色模式）、`components/ui/`（Button、Card、Modal、Avatar、AiBadge、ChatBubble、RiveAvatar、LanguageSwitcher、NavBar、SubmitButton）、五個頁面骨架（friend／lobby／history／profile／settings）、`lib/env.ts`（zod 驗證，缺值即報明確錯誤）、`lib/types.ts`＋`lib/config.ts`（07 §5／§6 逐字）、`supabase/migrations/0001_init.sql`（07 §4 逐字）、A 線 contracts stub＋fixtures，另建 B／C 線最小 stub 讓三人可同時開工。
- **為什麼這樣做**：走 M1「stub 先行」策略（07 §6）；登入用 server actions 回傳 `{ ok, error }`（錯誤即值）；初始化三張表集中在 `lib/profile/init.ts` 單一寫入者、重複呼叫安全。三語與 Rive 的決策見「共用與決策」。
- **改了哪些檔案**：`package.json`、各設定檔（`tsconfig`／`next.config.mjs`／`tailwind.config.ts`／`vitest.config.ts`）、`i18n/*`、`messages/{zh-CN,zh-HK,en}.json`、`middleware.ts`、`app/**`（全部）、`components/**`（全部）、`lib/**`、`fixtures/**`、`scripts/{worker,seed}.ts`、`supabase/migrations/0001_init.sql`、`public/riv/*.riv`（root 的三個 riv 檔搬入）、`tests/friend/*`。
- **踩到的坑**：React 18 沒有 `useActionState`／`useTransitionState`（React 19 API），改用 `useTransition`；`NextIntlClientProvider` 必須顯式傳 `messages`，否則 client 元件只會顯示 key；`tsconfig` 的 `exclude` 要排除 `scripts/`、`tests/`，否則 Next build 會把 stub 腳本一起型別檢查。
- **驗收**：`npm test` 13/13 通過、`npm run lint` 0 警告、`npm run build` 23 條路由（含三語 SSG）通過；本機 dev 實測：未登入 `/friend`→`/login` 307、`/zh-HK/friend`→`/zh-HK/login`、三語登入頁文案正確、缺環境變數時啟動報「缺少或無效的環境變數：NEXT_PUBLIC_SUPABASE_URL…」。註冊流程需要真實 Supabase 金鑰後由人工複驗。
- **還沒做完／待辦**：真實 Supabase 專案金鑰填入 `.env.local` 後跑註冊主線驗收；`0001_init.sql` 由 A 在 Supabase SQL Editor 執行（AI 不碰共用資料庫）；三語規格補進 02／07 文件；Chillax 字型檔。

---

## B：社交 Agent 線（Peter）

### 2026-10-30｜B1 一句話任務解析＋任務確認卡｜Peter（AI 協助）｜Closes #31
- **做了什麼**：
  - 後端：Prompt 14（`server/prompts/14_task.ts`，restatement 改成簡體）；`server/social/task.ts` 的 `createTaskFromText`（解析→寫 `agent_tasks` pending_confirm→寫日誌）、`changeTaskStatus`（confirm／pause／resume／cancel）；API `POST /api/tasks`、`GET /api/tasks/:id`、`POST /api/tasks/:id/{confirm,pause,resume,cancel}`；contract `createTaskFromText` 換成真的。
  - 前端：`src/lib/api/social.ts`（`createTask`／`getTask`／`updateTask`，`VITE_API_MODE=http` 打後端，否則 mock）、`src/features/social/components/TaskConfirmCard.tsx`（props `{ taskId, onStarted?, onCancelled? }`）。
- **為什麼這樣做**：
  - 模型漏給或給超出範圍的數字時，用 `normalizeParsed` 照 Prompt 14 規則補正（人數上限 10、合適人數預設 min(count,2)、最多代聊 count×2），不完全依賴模型。
  - A0b（Supabase client、登入）還沒做，所以 `agent_tasks` 讀寫放在 `server/social/taskStore.ts`：有 Supabase 就寫資料庫，沒有就用記憶體；`server/social/db.ts` 是暫用的 client，`log.ts` 也改用它。沒接資料庫時以固定的 `dev-user` 身分執行；有資料庫但沒登入就回「请先登录」，避免假身分寫進正式資料。
  - 狀態轉換寫成表（只允許合法轉換）；開始／繼續前檢查 `social_agent_enabled` 與 `shareable_confirmed`。
- **改了哪些檔案**：`server/prompts/14_task.ts`、`server/social/{task,taskStore,db,user}.ts`、`server/routes/social.ts`、`server/contracts/social.ts`、`server/lib/log.ts`、`src/lib/api/social.ts`、`src/features/social/components/TaskConfirmCard.tsx`、`tests/social/{task,task-api}.test.ts`。
- **給 A**：AI 朋友聊天頁的 mock 任務彈窗（`FriendPage.tsx` 的 `TaskConfirmModal`）可以換成 `createTask(text)` ＋ `<TaskConfirmCard taskId=… />`（A2）。
- **踩到的坑**：`src/vite-env.d.ts` 沒有 `vite/client` 型別，所以 `import.meta.env` 沒型別；在 `src/lib/api/social.ts` 開頭加 `/// <reference types="vite/client" />`，沒改 A 的檔案。
- **驗證**：`tsc -b` 通過；vitest 28/28，含驗收 1（登山任務解析為 sport／喜欢登山／3 人／2 位合適／最多 6 場，LLM 用 mock）與驗收 2（未確認對外檔案按開始回 403 與中文提示）；`npm run build` 成功。確認卡還沒放進任何頁面，畫面要等 A2 接上才看得到。
- **還沒做完／待辦**：用真實模型跑一次驗收 1（等 `MODEL_*` 與金鑰）；A0b 後把 `db.ts`、`user.ts` 換成 A 的共用版本，前端 `request()` 帶上登入 token。

---

### 2026-10-30｜B0 LLM 封裝、工作日誌、設定常數｜Peter（AI 協助）｜Closes #14
- **做了什麼**：`server/lib/config.ts`（07 §6 CONFIG 逐字）；`server/lib/llm/`：`llmText`／`llmJson`／`embed`、`LlmError { role, reason, attempts }`、`extractJson`；`server/lib/log.ts`：`writeLog`（寫 `agent_logs`，失敗只記 console）。contracts stub 在 S0 已完成。
- **為什麼這樣做**：
  - 重試由我們自己控制（SDK `maxRetries: 0`），總次數 `LLM_MAX_RETRIES + 1`；`llmJson` 重試時把上次輸出和「上次输出格式错误：…」補進 messages，讓模型自己修。
  - 平台不支援 `response_format: json_object`（回 400）時，記住並改用一般模式，再用 `extractJson` 從回應擷取第一段 JSON（支援 ```json 區塊、字串內含括號）。
  - `embed` 長度不符是設定錯誤，直接丟錯不重試。
  - 測試可用 `setLlmClient()`／`setLogWriter()` 換成假的，不打真 API、不碰共用資料庫。
- **改了哪些檔案**：`server/lib/config.ts`、`server/lib/llm/{index,client,env,json}.ts`、`server/lib/log.ts`、`tests/social/llm.test.ts`。
- **踩到的坑**：`npm ci` 在 Windows 上會因為有 Node 行程鎖住 `lightningcss` 原生檔而 EPERM，改用 `npm install`。用 tsx 動態 import 絕對路徑要寫成 `file:///D:/...`。
- **驗證**：`tsc -b` 通過；vitest 18/18（extractJson、schema 不符重試、逾時重試、最多 3 次後丟 LlmError、空字串重試、embed 長度檢查、writeLog 失敗不中斷）；另用本機假平台實測真的 OpenAI SDK：json_object 回 400 → 自動改一般模式並擷取 JSON、embed 有帶 `dimensions`。
- **還沒做完／待辦**：`server/lib/llm/env.ts` 與 `log.ts` 裡的 Supabase client 是暫時的，A0b 完成 `server/lib/env.ts`、`supabase.ts` 後改用共用的（log.ts 有 TODO）。真實平台的 JSON 模式支援度、`MODEL_*` 要實測後決定。

---

### 2026-10-30｜S0 後端骨架｜Peter（AI 協助）｜Closes #43
- **做了什麼**：新增 `server/`（Hono）：`app.ts` 組合三條線路由、`GET /api/health`、統一錯誤格式 `{ ok:false, error }`；`server/routes/{friend,social,twin}.ts` 空路由給各線填；`shared/types.ts`（07 §5 逐字）；`server/contracts/{friend,social,twin}.ts` 三個 stub＋`server/fixtures/`；`scripts/worker.ts` 佔位；`npm run server／worker／seed`；Vite `/api` 代理到 `127.0.0.1:8787`；`tsconfig.server.json`；`.env.example` 改成 docs/10 §2。介面語言定為簡體（07 §7.9、AGENTS 同步）。
- **為什麼這樣做**：A0 是純前端，LLM 金鑰與 service role 只能放後端；先把骨架和三條線的 contracts stub 立好，A0b、B0、C0 可以同時開工。各線只改自己的 `server/routes/<線>.ts`，`app.ts` 不用動，避免撞車。
- **改了哪些檔案**：`server/**`、`shared/types.ts`、`scripts/worker.ts`、`tests/social/server.test.ts`、`package.json`／lockfile（新增 hono、@hono/node-server、openai、zod、@supabase/supabase-js、tsx）、`vite.config.ts`、`tsconfig.json`、`tsconfig.server.json`、`.env.example`、`docs/07`、`docs/10`、`AGENTS.md`。
- **踩到的坑**：Windows 上 `localhost` 可能先解析成 IPv6，後端綁 `127.0.0.1`、代理也寫 `127.0.0.1`；`.env.local` 用 Node 內建 `process.loadEnvFile` 載入，不另裝 dotenv。zod 裝到的是 v4。
- **驗證**：`tsc -b` 通過；vitest 7/7；實際啟動後 `curl` 直連 8787 與經 Vite 代理的 `/api/health` 都回 `{"ok":true}`。
- **還沒做完／待辦**：`server/lib/env.ts`、`supabase.ts`、`auth.ts` 由 A0b 做；`server/lib/llm`、`log.ts`、`config.ts` 由 B0 做；`scripts/seed.ts` 由 C0 做。

---

## C：分身與大廳線（Jerry）

（還沒有紀錄）
