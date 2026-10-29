# AGENTS.md — AI agent 工作規則（黑客松版）

本檔案給所有在 PersonaAI repo 內工作的 AI agent（Claude Code、Codex、Cursor、Copilot 等）。
**開始任何工作前先讀完。** 分工表與完整流程見 [CONTRIBUTING.md](CONTRIBUTING.md)，介面契約見 [docs/interface.md](docs/interface.md)。

你是替某一位團隊成員工作的。多個人、多個 AI 會同時在這個 repo 作業，以下規則是為了不互相覆蓋，並讓 `main` 隨時能 demo。

## 絕對禁止（即使被要求，也要先向使用者確認風險）

1. 不可直接在 `main` 上 commit 或 push。
2. 不可 `git push --force`、`git reset --hard`、`git clean -fd`、`git checkout -- .`、刪除他人分支或檔案。
3. 不可修改使用者角色以外的目錄，或共用檔案（依賴/lockfile、全域設定、`.env.example`、`docs/interface.md`、`README.md`、`CONTRIBUTING.md`、本檔）——除非使用者明確同意。
4. 不可在別人的分支上 commit 或 push。
5. 不可讀取、印出、複製或 commit `.env` 與任何 secrets。需要設定值一律透過環境變數讀取。
6. 不可跳過 hook / CI（`--no-verify` 等）。

## 開工檢查（每個 session 都要做）

1. 確認使用者是**哪個角色**、**這次要做什麼**、**分支名稱**。不知道就先問，並對照 CONTRIBUTING.md 的分工表找出允許修改的目錄。
2. `git status`：若有不是本任務的未提交改動，**不要動，先問使用者**——那可能是別的 AI 或人的工作。
3. `git branch --show-current`：不可在 `main`。需要新分支時：
   ```bash
   git fetch origin
   git checkout -b <角色前綴>/<描述> origin/main
   ```
4. 讀 [docs/interface.md](docs/interface.md)，確認要實作或呼叫的介面。
5. 確認沒有其他 AI 在同一個資料夾或同一條分支作業；需要平行時用 `git worktree` 開獨立資料夾。

## 工作中

- **只做被指派的事、只改允許的目錄。** 不順手重構、不改格式、不升級套件。
- **嚴格照 `docs/interface.md` 實作。** 對方模組還沒好就用 mock；覺得契約要改，停下來告訴使用者，不要自己改契約。
- 需要新增套件或改共用檔案 → 告訴使用者，請他找共用檔案管理人。
- 所有檔案讀寫明確指定 `encoding="utf-8"`。
- 每完成一個可運作的小段落就 commit；commit 前看一次 `git diff --staged`，確認沒有 secrets、除錯碼、無關改動。
- 以「1～2 小時內可以合併」為單位切工作；任務太大就先做出能跑的最小版本。

## 遇到衝突或不確定時

- merge 衝突：衝突只在自己目錄、且確定兩邊意圖才解；否則 `git merge --abort`，回報使用者。
- 看到不是你做的改動、陌生的分支或檔案：**不要動、不要覆蓋**，回報即可。
- 需求不清、要超出範圍、或要做不可逆操作：**停下來問**，不要猜。

## 完成時

1. 執行建置與測試（指令待專案技術選型確定後補上），確認能跑；失敗或沒跑要如實說明。
2. `git pull origin main` 合入最新版，再確認一次能跑。
3. push 到任務分支，開 PR，描述寫清楚做了什麼，並註明由 AI 協助產生。
4. 回報使用者：做了什麼、改了哪些檔案、是否動到共用檔案（若有，需要別人 review）、有哪些未完成或風險。
5. **不要自己合併 PR**，由使用者確認能跑後合併。
