# PersonaAI 團隊協作規則

> 本文件給**團隊成員**與**每個人的 AI agent** 共同遵守。AI agent 的精簡版硬規則在 [AGENTS.md](AGENTS.md)。
> 規則有爭議時，在 Issue 討論後修改本文件（走 PR），不要私下各做各的。

## 1. 核心原則

1. **`main` 永遠是可運作的**。任何人（包含 AI）都不能直接 push 到 `main`。
2. **一件事 = 一個 Issue = 一條分支 = 一個 PR = 一位負責人**。
3. **先認領，再動手**。沒有認領的工作不要開始，避免兩個人（或兩個 AI）做同一件事。
4. **小步快跑**。PR 越小越好（建議 < 400 行變更），盡早合併，減少衝突。
5. **AI 是工具，人是負責人**。AI 產出的程式碼，由指派它的成員負責 review 與後果。

## 2. 開始工作前：認領任務

1. 到 GitHub **Issues** 找任務（或自己開一個）。
2. 在 Issue 把自己設為 **Assignee**，並留言「開始處理，預計動到：`路徑A`、`路徑B`」。
3. 已有 Assignee 的 Issue 不要接手；要接手先在 Issue 留言與對方確認。
4. 發現任務與別人預計動到的檔案重疊 → 先在 Issue 溝通，決定順序或切分範圍，再開工。

> 沒有 Issue 的小修正（錯字、註解）可以直接開 PR，但仍需分支 + PR。

## 3. 分支規則

- 從最新的 `main` 開分支，命名：`<類型>/<issue編號>-<簡短描述>`
  - 例：`feat/12-persona-editor`、`fix/27-login-crash`、`docs/5-readme`
- 類型：`feat`（功能）、`fix`（修 bug）、`docs`、`refactor`、`test`、`chore`
- **一條分支只屬於一個人（或一個 AI session）**。不要在別人的分支上 push，除非對方同意。
- 分支壽命盡量 < 3 天；太久就拆小或先合併一部分。
- 合併後立刻刪除分支。

```bash
git checkout main
git pull origin main
git checkout -b feat/12-persona-editor
```

## 4. 避免同時更新的衝突（重點）

### 4.1 人與人
- 開工前、午休後、準備開 PR 前，各做一次 `git pull --rebase origin main`（或把 main 合進自己的分支）。
- 每天結束前，把進度 push 到自己的分支（即使未完成，PR 標成 Draft）。

### 4.2 AI agent 同時作業
- **每個 AI agent 必須在獨立的工作目錄**，不可兩個 agent 共用同一個資料夾。
  - 同一台電腦要跑多個 agent：用 `git worktree`，一個分支一個資料夾：
    ```bash
    git worktree add ../PersonaAI-feat-12 feat/12-persona-editor
    ```
- **一個分支同一時間只能有一個 AI session 在寫**。
- AI 只能動 Issue 裡聲明的範圍；需要改範圍外的檔案，先停下來問負責人。

### 4.3 高衝突檔案（熱點）
以下檔案最容易撞車，**修改前必須在 Issue/群組先喊一聲，且改動要小、要快合**：
- 依賴與鎖定檔：`package.json`、`package-lock.json` / `pnpm-lock.yaml` / `requirements.txt` 等
- 全域設定、路由總表、資料庫 schema / migration
- `README.md`、本文件、`AGENTS.md`

規則：
- **鎖定檔（lockfile）發生衝突時，不要手動合併**：以 `main` 的版本為準，重新執行安裝指令產生。
- **資料庫 migration 一次只允許一個人新增**，編號/時間戳衝突時由後開 PR 的人重新產生。
- 新功能盡量**新增檔案**而不是大改既有檔案；多人共用的大檔案先拆分（單獨一個 refactor PR）。
- 不要順手「整理格式」或大規模重新命名，這類改動單獨開 PR 並事先公告。

## 5. Commit 規則

格式（Conventional Commits）：

```
<類型>(<範圍>): <簡短說明>

(可選) 詳細說明、原因
Refs #12
```

- 例：`feat(editor): 新增 persona 編輯頁面`、`fix(auth): 修正 token 過期未重新整理`
- 一個 commit 做一件事；不要把無關改動混在一起。
- **嚴禁 commit**：密碼、API Key、`.env`、個人憑證、大型二進位檔、`node_modules` 等。
- 禁止 `git push --force` 到共用分支（`main`）；自己的分支 rebase 後可用 `--force-with-lease`。

## 6. Pull Request 規則

1. 推上分支後開 PR，base 為 `main`，內文用 PR 範本填寫，並連結 Issue（`Closes #12`）。
2. 未完成先開 **Draft PR**，讓大家看見進度與範圍。
3. 合併條件：
   - 至少 **1 位其他成員** approve（AI 不能 approve 或 merge 自己的 PR）
   - CI / 測試通過（若已設定）
   - 與 `main` 沒有衝突
   - 所有 review 留言已處理
4. 合併方式：**Squash and merge**，保持 `main` 歷史乾淨。
5. 作者本人（人類）負責合併；合併前再 rebase/merge 一次最新的 `main`。
6. Review 要在 **24 小時內**回覆；卡住就在群組提醒。

## 7. 使用 AI agent 的規範

- 成員要確保自己的 AI 已讀過 [AGENTS.md](AGENTS.md)（本 repo 已提供 `CLAUDE.md` 指向它）。
- 下指令時要明確給 AI：**Issue 編號、分支名、允許修改的範圍**。
- AI 產出的程式碼，提 PR 前**人要先自己看過、跑過**，不要把未檢查的輸出直接丟給 reviewer。
- 在 PR 描述註明哪些部分由 AI 產生，方便 reviewer 重點檢查。
- AI 不確定、遇到衝突、或要做破壞性操作時，必須停下來問人，不可自行猜測。

## 8. 溝通與決策

- 任務/範圍/技術決策 → 寫在 **Issue**（有紀錄）。
- 即時協調（誰在動哪個檔案、熱點檔案）→ 團隊群組。
- 重大決策（換框架、改資料結構、改本規則）→ 開 Issue 標 `decision`，大家同意後再做，並更新文件。
- 發現 `main` 壞掉：**立刻通知大家**，優先修復或 revert，其他 PR 暫停合併。

## 9. 快速檢查清單

**開工前**
- [ ] Issue 已認領並寫明預計動到的檔案
- [ ] 已從最新 `main` 開新分支（AI 用獨立 worktree/資料夾）

**開 PR 前**
- [ ] 已 rebase / merge 最新 `main`，無衝突
- [ ] 本地跑過建置與測試
- [ ] 沒有 secrets、沒有無關改動
- [ ] PR 範本已填、已連結 Issue

**合併後**
- [ ] 刪除分支、Issue 已關閉
- [ ] 其他人若受影響，通知更新 `main`
