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

### 2026-10-30｜A0 加入三語 i18n、Rive 動畫與兩個新套件｜Vincent（AI 協助）｜直接 commit main（骨架階段）
- **做了什麼**：A0 骨架在 07 §3 的結構上擴充三項：全站三語（zh-CN 預設、zh-HK 粵語、en）、三個 Rive 動畫（`public/riv/`：robot=friends 頁頭像、fish=大廳、red_birdie=登入頁）、新增套件 `next-intl`、`@rive-app/react-canvas`。
- **為什麼這樣做**：頁面結構因此從 `app/friend/...` 改為 `app/[locale]/friend/...`（07 §3 的字面路徑位移一層，檔案歸屬不變）；zh-CN 走無前綴 URL（`/friend`），zh-HK／en 走 `/zh-HK/...`、`/en/...`。介面文字改走 `messages/*.json`，取代 07 §7.9 的「介面文字用繁體中文」——這是規格變更，之後補進 02／07 文件。
- **給 B、C**：`lib/contracts/social.ts`、`lib/contracts/twin.ts`、`lib/llm/`、`lib/log.ts`、`scripts/worker.ts`、`scripts/seed.ts` 已有正確簽名的 stub＋fixtures，請直接改寫內部；頁面要拿翻譯文字一律 `useTranslations()`／`getTranslations()`，不要硬編文字。
- **還沒做完／待辦**：Hum token 數值是主題頁的近似值，正式 skill 檔安裝後可比對微調；Chillax 字型檔尚未放入（後備 Noto Sans 已生效）。

---

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

### 2026-10-30｜A0 專案骨架、登入、共用元件、設計 token｜Vincent（AI 協助）｜直接 commit main（骨架階段）
- **做了什麼**：Next.js 14（App Router、TS strict、Tailwind）專案骨架：登入／註冊（Supabase Auth＋`/api/profile/init` 冪等初始化三張表）、`middleware.ts`（next-intl＋Supabase session＋未登入導向）、Hum 主題 token 寫入 `app/globals.css`（含深色模式）、`components/ui/`（Button、Card、Modal、Avatar、AiBadge、ChatBubble、RiveAvatar、LanguageSwitcher、NavBar、SubmitButton）、五個頁面骨架（friend／lobby／history／profile／settings）、`lib/env.ts`（zod 驗證，缺值即報明確錯誤）、`lib/types.ts`＋`lib/config.ts`（07 §5／§6 逐字）、`supabase/migrations/0001_init.sql`（07 §4 逐字）、A 線 contracts stub＋fixtures，另建 B／C 線最小 stub 讓三人可同時開工。
- **為什麼這樣做**：走 M1「stub 先行」策略（07 §6）；登入用 server actions 回傳 `{ ok, error }`（錯誤即值）；初始化三張表集中在 `lib/profile/init.ts` 單一寫入者、重複呼叫安全。三語與 Rive 的決策見「共用與決策」。
- **改了哪些檔案**：`package.json`、各設定檔（`tsconfig`／`next.config.mjs`／`tailwind.config.ts`／`vitest.config.ts`）、`i18n/*`、`messages/{zh-CN,zh-HK,en}.json`、`middleware.ts`、`app/**`（全部）、`components/**`（全部）、`lib/**`、`fixtures/**`、`scripts/{worker,seed}.ts`、`supabase/migrations/0001_init.sql`、`public/riv/*.riv`（root 的三個 riv 檔搬入）、`tests/friend/*`。
- **踩到的坑**：React 18 沒有 `useActionState`／`useTransitionState`（React 19 API），改用 `useTransition`；`NextIntlClientProvider` 必須顯式傳 `messages`，否則 client 元件只會顯示 key；`tsconfig` 的 `exclude` 要排除 `scripts/`、`tests/`，否則 Next build 會把 stub 腳本一起型別檢查。
- **驗收**：`npm test` 13/13 通過、`npm run lint` 0 警告、`npm run build` 23 條路由（含三語 SSG）通過；本機 dev 實測：未登入 `/friend`→`/login` 307、`/zh-HK/friend`→`/zh-HK/login`、三語登入頁文案正確、缺環境變數時啟動報「缺少或無效的環境變數：NEXT_PUBLIC_SUPABASE_URL…」。註冊流程需要真實 Supabase 金鑰後由人工複驗。
- **還沒做完／待辦**：真實 Supabase 專案金鑰填入 `.env.local` 後跑註冊主線驗收；`0001_init.sql` 由 A 在 Supabase SQL Editor 執行（AI 不碰共用資料庫）；三語規格補進 02／07 文件；Chillax 字型檔。

---

## B：社交 Agent 線（Peter）

（還沒有紀錄）

---

## C：分身與大廳線（Jerry）

（還沒有紀錄）
