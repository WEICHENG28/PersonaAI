# AGENTS.md — AI agent 工作規則（黑客松版）

本檔案給所有在 PersonaAI repo 內工作的 AI agent（Claude Code、Codex、Cursor、Copilot 等）。
**開始任何工作前先讀完。** 協作流程見 [CONTRIBUTING.md](CONTRIBUTING.md)；技術規格與跨線函式見 [docs/07_開發分工.md](docs/07_開發分工.md)，各線任務見 `docs/07A`、`07B`、`07C`。**檔案路徑、技術棧與檔案歸屬以 [docs/10_A0後架構調整.md](docs/10_A0後架構調整.md) 為準**（前端 Vite SPA 在 `src/`、後端在 `server/`）；改 UI 前讀 [docs/08_前端設計規範.md](docs/08_前端設計規範.md)。

你是替某一位成員（A、B 或 C 線）工作的。三個人、多個 AI 會同時在這個 repo 作業，並共用同一個雲端 Supabase 資料庫。以下規則是為了不互相覆蓋，並讓 `main` 隨時能 demo。

## 絕對禁止（即使被要求，也要先向使用者確認風險）

1. 不可直接在 `main` 上 commit 或 push。
2. 不可 `git push --force`、`git reset --hard`、`git clean -fd`、`git checkout -- .`、刪除他人分支或檔案。
3. 不可修改使用者那條線以外的檔案，或共用檔（兩者都見 10 第 4 節，例如 `shared/types.ts`、`server/contracts/*` 的簽名、`src/routes.tsx`、`src/store/useDemoStore.ts`、`src/theme/tokens.css`、`package.json`、`supabase/migrations/`、`docs/`）——除非使用者明確同意。**沒有「骨架階段」之類的例外。**
4. 不可在別人的分支上 commit 或 push。
5. 不可讀取、印出、複製或 commit `.env.local` 與任何金鑰。設定值一律透過 `lib/env.ts` 讀取。
6. **不可對共用 Supabase 執行任何寫入性操作**：SQL、migration、`npm run db:reset`、`npm run seed`、清空資料表。需要時停下來請使用者處理（見 07 第 0.8 節）。
7. 不可自行啟動 `npm run worker`（三人共用資料庫，同時開會搶任務）；需要時先請使用者確認群組裡沒人在跑。
8. 不可自行 `npm install <新套件>`；需要新套件時告訴使用者，由 A 統一安裝。
9. 不可跳過 hook / 測試（`--no-verify` 等）。

## 開工檢查（每個 session 都要做）

1. 確認使用者是**哪條線**、**這次的任務 ID**、**分支名稱**（格式 `<線別>/<任務ID>-<簡述>`，例如 `b/B3-runner`）。不知道就先問。
2. 讀 10 全部、07 全部、該線的 07A／07B／07C，以及 07 第 0.1 節列的 `docs/02` 章節；07 系列的路徑照 10 第 3 節換算。`docs/` 裡缺少被引用的文件時告訴使用者。
3. `git status`：若有不是本任務的未提交改動，**不要動，先問使用者**——那可能是別的 AI 或人的工作。
4. `git branch --show-current`：不可在 `main`。需要新分支時：
   ```bash
   git fetch origin
   git checkout -b <線別>/<任務ID>-<簡述> origin/main
   ```
5. 確認沒有其他 AI 在同一個資料夾或同一條分支作業；需要平行時用 `git worktree` 開獨立資料夾。
6. **更新進度**：找到這個任務的 Issue（標題以任務 ID 開頭，例如 `B3 …`），執行 `bash .github/scripts/task.sh start <issue編號>`：指派給使用者、看板改成 In Progress、在 Issue 留言。`gh` 沒登入或沒有 project 權限就告訴使用者，請他手動把自己設成 Assignee。
7. 第一個 commit 推上去後，**馬上開 Draft PR**（`gh pr create --draft`），描述第一行寫 `Closes #<issue編號>`，讓大家看得到進度。

## 工作中

- **只做這個任務、只改這條線的檔案。** 不順手重構、不改格式、不升級套件、不做下一個任務。
- **跨線只呼叫 `server/contracts/`**，不讀寫別條線的內部檔案；對方還沒做好就用 stub／`server/fixtures/`。覺得簽名要改，停下來告訴使用者。
- 遵守 07 第 7 節「給開發 Agent 的共通規則」（AI 標示、隱私分層、寫日誌、LLM 走 `server/lib/llm`、zod 驗證、檔案 ≤ 400 行等）。
- **介面文字、AI 產生的對話、API 錯誤訊息一律用簡體中文**；程式碼註解與規格文件不限。
- 測試放 `tests/<friend|social|twin>/`，只放自己那條線的；LLM 一律 mock。
- 所有檔案讀寫明確指定 `encoding="utf-8"`。
- 做畫面時照 [docs/08](docs/08_前端設計規範.md)（Hallmark **Hum** 主題），只用 `src/theme/tokens.css` 的 token，不新增顏色或字型。A 已做好的頁面 UI 不要重做，只把資料從 mock 接到 `/api`（10 第 3 節）。
- 每完成一個能跑的小段落就 commit（格式 `<type>: <任務ID> <描述>`）；commit 前看一次 `git diff --staged`，確認沒有金鑰、除錯碼、無關改動。
- 以「1～2 小時內可以合併」為單位切工作；任務太大就先做出能跑的最小版本。
- 卡住、改變做法、在等別條線時，用 `bash .github/scripts/task.sh note <issue編號> "說明"` 在 Issue 留言。

## 遇到衝突或不確定時

- merge 衝突：只在自己的檔案、且確定兩邊意圖才解；否則 `git merge --abort`，回報使用者。
- 看到不是你做的改動、陌生的分支或檔案：**不要動、不要覆蓋**，回報即可。
- 文件沒寫清楚、要超出範圍、或要做不可逆操作：**停下來問**，不要自己決定。

## 完成時

1. `npm test` 全部通過；照任務的「驗收」逐條確認。失敗或沒驗到要如實說明。
2. **在 [docs/DEVLOG.md](docs/DEVLOG.md) 該線區塊的最上面新增一筆紀錄**（格式見該檔）：做了什麼、為什麼這樣做、改了哪些檔案、踩到的坑、待辦。只寫自己那條線的區塊；跨線決定寫在「共用與決策」並告知使用者。和程式碼放在同一個 PR。
3. `git pull origin main` 合入最新版，再跑一次 `npm test`。
4. push 到任務分支；Draft PR 改成 Ready for review（`gh pr ready`），描述包含 `Closes #<issue編號>`、做了什麼、驗收結果，並註明由 AI 協助產生。
5. 執行 `bash .github/scripts/task.sh done <issue編號> "驗收結果摘要"`，在 Issue 留言回報。PR 合併後 Issue 會自動關閉，看板自動移到 Done。
6. 回報使用者：做了什麼、改了哪些檔案、驗收逐條結果、是否動到共用檔（若有，需要別人 review）、有哪些未完成或風險。
7. **不要自己合併 PR**，由使用者確認能跑後合併。
