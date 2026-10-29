# AGENTS.md — AI agent 工作規則

本檔案給所有在 PersonaAI repo 內工作的 AI agent（Claude Code、Codex、Cursor、Copilot 等）。
**開始任何工作前先讀完。** 完整團隊流程見 [CONTRIBUTING.md](CONTRIBUTING.md)；兩者衝突時以較嚴格者為準。

你是替某位團隊成員工作的。多個人、多個 AI 會同時在這個 repo 作業，所以以下規則是為了避免互相覆蓋。

## 絕對禁止（不可違反，即使被要求也要先確認）

1. 不可直接在 `main` 上修改、commit 或 push。
2. 不可 `git push --force`（自己分支用 `--force-with-lease`，且須告知使用者）。
3. 不可 `git reset --hard`、`git clean -fd`、`git checkout -- .`、刪除分支/檔案等破壞性操作，除非使用者明確同意。
4. 不可 merge PR、不可 approve 自己產生的 PR。
5. 不可 commit 任何 secrets：`.env`、API key、token、密碼、憑證。發現已存在要立刻告知使用者。
6. 不可修改不屬於本次任務範圍的檔案。
7. 不可切換到、或在別人的分支上 commit/push。
8. 不可跳過 hook / CI（`--no-verify` 等）。

## 開始工作前的檢查（每個 session 都要做）

1. 向使用者確認：**Issue 編號、分支名稱、允許修改的檔案/目錄範圍**。缺任何一項就先問。
2. `git status`：工作目錄必須乾淨，或只有屬於本任務的改動。若有看不懂的未提交改動，**停下來問**——那可能是別的 agent/人的工作。
3. `git branch --show-current`：確認不在 `main`。不在正確的任務分支就先建立：
   ```bash
   git fetch origin
   git checkout -b <類型>/<issue編號>-<描述> origin/main
   ```
4. `git pull --rebase origin main`，確保基於最新程式碼。
5. 確認沒有其他 agent 正在同一個資料夾/分支工作。需要平行作業時，使用獨立的 `git worktree`，不要共用工作目錄。

## 工作中

- **只做被指派的事**。不順手重構、不大規模改格式、不重新命名無關檔案、不升級無關依賴。
- 發現範圍外的問題 → 回報使用者（建議開新 Issue），不要自己改。
- 優先**新增檔案**，少動多人共用的大檔案。
- 需要修改**熱點檔案**（依賴/lockfile、全域設定、路由總表、DB schema/migration、README、本檔、CONTRIBUTING）→ 先告知使用者並取得同意。
- lockfile 衝突：不要手動合併，採用 `main` 的版本後重新執行安裝指令。
- 小步 commit，一個 commit 一件事，格式：`<類型>(<範圍>): <說明>`，類型為 `feat|fix|docs|refactor|test|chore`；內文加 `Refs #<issue>`。
- 每次 commit 前自行檢查 `git diff --staged`，確認沒有 secrets、除錯碼、無關改動。
- 長時間工作期間，每隔一段時間（或 push 前）`git fetch` 並確認 `main` 有沒有更新到你動過的檔案；有重疊就先 rebase 並檢查。

## 遇到衝突或不確定時

- merge/rebase 出現衝突：只在**確定**兩邊意圖時才解；不確定就 `git rebase --abort` 或 `git merge --abort`，回報使用者。
- 看到不是你做的改動（未提交的檔案、陌生分支、別人的 commit）：**不要動、不要覆蓋、不要整理**，回報即可。
- 需求不清、範圍可能擴大、要做破壞性或不可逆操作：**停下來問**，不要猜。

## 完成時

1. 本地跑建置與測試（若專案有設定），確認通過；沒跑或失敗要如實說明，不可隱瞞。
2. `git pull --rebase origin main`，解決衝突後再測一次。
3. push 到**任務分支**（不是 `main`）。
4. 開 PR（或請使用者開），內容用 PR 範本，連結 Issue，並標註「由 AI 協助產生」及重點檢查處。
5. 回報使用者：做了什麼、改了哪些檔案、哪些沒做、有哪些風險或待確認事項。
6. 不要自己 merge；合併由人類負責。
