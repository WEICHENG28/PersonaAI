# PersonaAI 團隊協作規則（黑客松版）

> 給**團隊成員**與**每個人的 AI agent** 共同遵守。AI 的精簡硬規則在 [AGENTS.md](AGENTS.md)。
> 黑客松時間短，規則的目標只有兩個：**不撞車、`main` 隨時能 demo**。

## 1. 鐵則（違反會害到別人）

1. **禁止直接 push 到 `main`**，一律分支 + PR。
2. **只改自己負責的目錄**（見第 2 節分工表）。要改別人的或共用檔案，先講。
3. **`main` 永遠要能跑、能 demo**。合併後立刻確認；壞了就馬上修或 revert，其他人先停止合併。
4. **每 1～2 小時合併一次**，不要累積到最後才整合。
5. **絕不 commit 機密**：`.env`、API key、token、密碼。
6. **禁止 `git push --force`**、`git reset --hard` 等破壞性操作。
7. 所有檔案讀寫明確指定 `encoding="utf-8"`（開發環境是 Windows，會踩 cp950 亂碼）。

## 2. 分工與目錄所有權

> ⚠️ 待填：產品規劃與分工確定後補上。

| 角色 | 成員 | 負責內容 | 負責目錄 | 分支前綴 |
|---|---|---|---|---|
| A | （待填） | （待填） | `（待填）/` | `a/` |
| B | （待填） | （待填） | `（待填）/` | `b/` |
| C | （待填） | （待填） | `（待填）/` | `c/` |
| D | （待填） | （待填） | `（待填）/` | `d/` |

**共用檔案管理人：（待填）**
以下檔案只有管理人改，其他人要改請告訴他：
- 依賴與鎖定檔（`package.json`、lockfile、`requirements.txt` 等）
- 全域設定、環境變數範本（`.env.example`）
- `docs/interface.md`、`README.md`、本文件、`AGENTS.md`

lockfile 衝突時**不要手動合併**：以 `main` 的版本為準，重新執行安裝指令產生。

## 3. 介面契約（開場第一小時完成）

各角色之間怎麼呼叫（API 路徑、函式名稱、資料格式），開場就寫進 [docs/interface.md](docs/interface.md)。
- 定好之後大家照契約各寫各的，**不用等對方做完**；對方還沒好就先用假資料（mock）。
- 要改契約 → 先在群組講，由共用檔案管理人更新，所有相關的人確認過才算數。

## 4. 每輪工作流程（約 1～2 小時一輪）

```bash
# 1. 拉最新的 main，開新分支
git checkout main
git pull
git checkout -b a/login-page        # <角色前綴>/<簡短描述>

# 2. ...寫程式（只動自己的目錄）...

# 3. 推上去前，再合一次最新 main，確認能跑
git pull origin main
git add <你改的檔案>
git commit -m "新增登入頁面與表單驗證"
git push -u origin a/login-page
```

接著到 GitHub 開 PR：
- **只動自己目錄** → 確認能跑後，**自己合併**。
- **動到共用檔案或別人的目錄** → 找相關的人看過再合併。
- 合併後刪掉分支，下一輪從最新 `main` 開新分支。

commit 訊息讓人一看就懂即可：「新增登入頁面」可以，「update」「修改」不行。

## 5. 使用 AI agent

- 確保自己的 AI 讀過 [AGENTS.md](AGENTS.md)。Claude Code 會透過 `CLAUDE.md` 自動載入；Codex、Cursor 會自動讀 `AGENTS.md`；其他 AI 請手動貼給它。
- 開工時這樣下指令：
  > 先讀 AGENTS.md 和 CONTRIBUTING.md。我是角色 A，這次要做「登入頁面」，分支用 `a/login-page`，只能改 `frontend/` 底下的檔案。
- **一個 AI 一個工作資料夾**。同一台電腦要同時跑多個 AI，用 `git worktree`：
  ```bash
  git worktree add ../PersonaAI-login a/login-page
  ```
- **同一條分支同一時間只能有一個 AI 在寫。**
- AI 寫完，**人要先跑過、看過**再合併。

## 6. 時程

| 階段 | 時間 | 重點 |
|---|---|---|
| 開場 | 第 1 小時 | 定分工、目錄結構、介面契約；共用檔案管理人建好專案骨架 |
| 開發 | 中段 | 每 1～2 小時一輪合併；定時在群組同步進度與卡點 |
| **功能凍結** | **結束前 3～4 小時** | 不加新功能，只修 bug、整合、準備 demo |
| Demo 準備 | 最後 1 小時 | 用 `main` 最新版跑完整 demo 流程，錄備用影片 |

## 7. 出問題時

- **合併衝突**：只動自己目錄的話很少發生。發生時找改到同一處的人一起決定；不確定就先 `git merge --abort`，再問。
- **`main` 壞了**：群組喊一聲 → 最後合併的人優先修，修不好就 revert 那個 PR。
- **契約對不上**：以 `docs/interface.md` 為準；文件沒寫的地方，當面講清楚再補進文件。
