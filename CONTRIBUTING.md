# PersonaAI 團隊協作規則（黑客松版）

> 給**團隊成員**與**每個人的 AI agent** 共同遵守。AI 的精簡硬規則在 [AGENTS.md](AGENTS.md)。
> 黑客松時間短，規則的目標只有兩個：**不撞車、`main` 隨時能 demo**。
> 技術規格（技術棧、資料夾、資料表、型別、跨線函式、時程）在 [docs/07_開發分工.md](docs/07_開發分工.md)。

## 1. 鐵則（違反會害到別人）

1. **禁止直接 push 到 `main`**，一律分支 + PR（A0 專案骨架也一樣）。
2. **只改自己那條線的檔案**（見第 2 節）。要改別條線的或共用檔，先在群組講。
3. **`main` 永遠要能跑、能 demo**。合併後立刻確認；壞了就馬上修或 revert，其他人先停止合併。
4. **每 1～2 小時合併一次**，不要累積到最後才整合。
5. **共用雲端資料庫小心操作**：`db:reset`、migration、`seed`、`worker` 照 [07 第 0.8 節](docs/07_開發分工.md)。
6. **絕不 commit 機密**：`.env.local`、Supabase key、LLM API key。金鑰私下傳，不貼群組。
7. **禁止 `git push --force`**、`git reset --hard` 等破壞性操作。
8. 所有檔案讀寫明確指定 `encoding="utf-8"`（開發環境是 Windows，會踩 cp950 亂碼）。
9. **每個 PR 都要在 [docs/DEVLOG.md](docs/DEVLOG.md) 自己那條線的區塊寫一筆紀錄**：做了什麼、為什麼、改了哪些檔案、踩到的坑、待辦。方便之後維護。

## 2. 分工與檔案歸屬

| 線 | 成員 | 負責 | 規格 | 分支前綴 |
|---|---|---|---|---|
| A：AI 朋友線 | Vincent | 陪伴你、認識你、回報結果；專案骨架、登入、共用元件、部署 | [07A](docs/07A_AI朋友線.md) | `a/` |
| B：社交 Agent 線 | Peter | 接任務、挑人、判定、決策；LLM 封裝、日誌、常數 | [07B](docs/07B_社交Agent線.md) | `b/` |
| C：分身與大廳線 | Jerry | 分身代聊、大廳、接手；Realtime、種子用戶 | [07C](docs/07C_分身與大廳線.md) | `c/` |

- 每個檔案屬於哪條線，見 [07 第 3 節](docs/07_開發分工.md) 的專案結構。
- 要用別條線的功能，**只能呼叫 `lib/contracts/`**，對方還沒好就用 stub。
- **共用檔**（`lib/types.ts`、contracts 函式簽名、`supabase/migrations/`、`package.json`／lockfile、`.env.example`、`globals.css` token、本文件、`AGENTS.md`、`README.md`、`.github/`、`docs/`）照 [07 第 0.5 節](docs/07_開發分工.md) 改：群組提出 → 三人同意 → 提出的人改 → 請人看過再合併。
- 新增套件找 A；lockfile 衝突不要手動合併，以 `main` 為準重新 `npm install`。

## 3. 每個任務的流程

```bash
# 1. 從最新 main 開分支：<線別>/<任務ID>-<簡述>
git checkout main
git pull
git checkout -b b/B3-runner

# 2. 交給 AI（指令範本見 07 第 0.4 節）→ 先寫測試 → 實作 → npm test

# 3. 推上去前合入最新 main，再測一次
git pull origin main
npm test
git add <你改的檔案>
git commit -m "feat: B3 Agent 迴圈與 worker"
git push -u origin b/B3-runner
```

commit 前，在 [docs/DEVLOG.md](docs/DEVLOG.md) 自己那條線的區塊最上面加一筆紀錄（格式見該檔）。

到 GitHub 開 PR：
- **只改自己那條線** → `npm test` 通過、網站能跑，**自己合併**。
- **動到共用檔或別條線** → 請相關的人看過再合併。
- 合併後刪分支、在群組通知大家 `git pull`。

Commit 格式：`<type>: <任務ID> <描述>`，type 用 `feat`、`fix`、`refactor`、`test`、`docs`、`chore`。

### 進度怎麼更新（AI 會照 AGENTS.md 自動做）

| 時機 | 做什麼 | 看板狀態 |
|------|--------|---------|
| 開工 | `bash .github/scripts/task.sh start <issue編號>`：指派自己、在 Issue 留言 | In Progress |
| 第一個 commit 推上去 | 開 **Draft PR**，第一行寫 `Closes #<issue編號>` | In Progress |
| 卡住／等別條線 | `bash .github/scripts/task.sh note <issue編號> "說明"` | — |
| 完成 | Draft 改成 Ready，`bash .github/scripts/task.sh done <issue編號> "驗收結果"` | In Progress |
| PR 合併 | Issue 自動關閉 | Done |

腳本要用 `gh`（GitHub CLI）：安裝後 `gh auth login`，再 `gh auth refresh -s project` 取得看板權限。

## 4. 使用 AI agent

- AI 要讀 [AGENTS.md](AGENTS.md)。Claude Code 會透過 `CLAUDE.md` 自動載入；Codex、Cursor 會自動讀 `AGENTS.md`；其他 AI 請手動貼給它。
- 開工指令用 [07 第 0.4 節](docs/07_開發分工.md) 的範本，或各線文件第 0 節的「第一個交給 Agent 的指令」。一定要給：**線別、任務 ID、分支名**。
- **一個 AI 一個工作資料夾**。同一台電腦要同時跑多個 AI，用 `git worktree`：
  ```bash
  git worktree add ../PersonaAI-B3 b/B3-runner
  ```
  每個 worktree 都要各自 `npm install`，並複製一份 `.env.local`。
- **同一條分支同一時間只能有一個 AI 在寫。**
- AI 寫完，**人要先跑過、看過**再合併。

## 5. 時程

照 [07 第 9 節](docs/07_開發分工.md) 的 M1～M5 里程碑，另外：

- **M1（前 4 小時）最關鍵**：A0 骨架、B0 LLM 封裝、C0 種子用戶與各線 contracts stub。`lib/types.ts` 在 M1 定稿，之後要改就走共用檔流程。
- **功能凍結：結束前 3～4 小時**。不加新功能，只修 bug、整合、調 Prompt。
- **最後 1 小時**：用 `main` 最新版照 07 第 10 節跑完整 Demo，錄備用影片。

## 6. 出問題時

- **合併衝突**：只改自己的檔案的話很少發生。發生時找改到同一處的人一起決定；不確定就 `git merge --abort` 再問。
- **`main` 壞了**：群組喊一聲 → 最後合併的人優先修，修不好就 revert 那個 PR。
- **契約對不上 / 文件沒寫到**：以 `docs/` 為準；沒寫的三人討論後補進文件再繼續（見 07 第 0.7 節）。
