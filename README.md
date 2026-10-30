# PersonaAI

**AI 朋友認識你，社交 Agent 替你找到合得來的人。**

黑客松作品（Agent 賽道）。AI 朋友在日常聊天中認識你；你用一句話交辦任務，社交 Agent 從大廳挑人，派你的分身先去聊；評審 Agent 判定合適後，AI 朋友回報結果，你再本人接手。

## 團隊

| 線 | 成員 | 負責 | 規格 |
|---|---|---|---|
| A：AI 朋友線 | Vincent | AI 朋友、記憶、用戶檔案、回報；專案骨架、登入、共用元件、部署 | [07A](docs/07A_AI朋友線.md) |
| B：社交 Agent 線 | Peter | 任務解析、挑人、評審判定、歷史、工作日誌、效率統計；LLM 封裝 | [07B](docs/07B_社交Agent線.md) |
| C：分身與大廳線 | Jerry | 分身代聊、隱私守門、聊天室、接手、請求真人、大廳；種子用戶 | [07C](docs/07C_分身與大廳線.md) |

## 新成員開工

1. 接受 GitHub 邀請，然後：
   ```bash
   git clone https://github.com/WEICHENG28/PersonaAI.git
   cd PersonaAI
   ```
2. 安裝：
   - Node.js 20 以上、Git
   - 你的 AI agent（例如 VS Code＋Claude Code）
   - [GitHub CLI](https://cli.github.com/)，登入並取得看板權限：`gh auth login`，再 `gh auth refresh -s project`
   - 介面設計 skill：`npx skills add nutlope/hallmark -g`
3. 讀 [CONTRIBUTING.md](CONTRIBUTING.md)（協作規則）和自己那條線的規格（上表）。
4. 到 [Issues](https://github.com/WEICHENG28/PersonaAI/issues) 找自己那條線的任務（標籤「線A／線B／線C」）。
5. 把任務交給 AI：各線規格第 0 節有「第一個交給 Agent 的指令」，複製去用。
   AI 會自動讀 [AGENTS.md](AGENTS.md)（Claude Code 透過 `CLAUDE.md`），並照規則開分支、更新 Issue 進度、寫開發紀錄。

專案骨架（A0）完成後，再照 [07 第 0.2 節](docs/07_開發分工.md) 完成 `npm install`、`.env.local` 與 Supabase 設定。金鑰私下傳，不要貼在群組或 commit。

## 進度在哪看

- **介面 demo（mock，不用後端）**：https://weicheng28.github.io/PersonaAI/ ，`main` 更新後幾分鐘內自動同步
- **進度看板**：[PersonaAI 進度](https://github.com/users/WEICHENG28/projects/2)，分成 Todo／In Progress／Done，卡片就是 Issue，會自動移動
- **每個任務**：[Issues](https://github.com/WEICHENG28/PersonaAI/issues)，Issue 留言是開工、卡住、完成的紀錄
- **正在做的程式**：[Pull requests](https://github.com/WEICHENG28/PersonaAI/pulls)，Draft PR 代表還在做
- **做了什麼、為什麼**：[docs/DEVLOG.md](docs/DEVLOG.md)

## 文件

| 文件 | 內容 |
|---|---|
| [01 背景與競品](docs/01_背景與競品.md) | 賽道、評分、痛點、競品 |
| [02 核心邏輯與功能](docs/02_核心邏輯與功能.md) | **產品邏輯以這份為準**：F1–F13、Agent 工作循環、判定、隱私 |
| [03 分工、進度與優先級](docs/03_分工進度與優先級.md) | P0／P1、Demo 腳本、風險 |
| [04 技術架構](docs/04_技術架構.md) | 多 Agent 架構、模型選型、Prompt 清單 |
| [05 評分導向功能補強](docs/05_評分導向功能補強.md) | 依評分維度新增的功能 |
| [06 終極精簡版](docs/06_終極精簡版.md) | 一頁看完所有功能 |
| [07 開發分工](docs/07_開發分工.md) | **怎麼做**：技術棧、資料夾歸屬、資料表、型別、跨線函式、時程 |
| [08 前端設計規範](docs/08_前端設計規範.md) | 改 UI 前必讀：頂欄、版面、Hum 規則 |
| [09 Agent 數據結構](docs/09_Agent數據結構.md) | 五個 Agent 的 JSON 狀態結構藍圖（Vincent 提案） |
| [10 A0 後架構調整](docs/10_A0後架構調整.md) | **目前的架構與檔案歸屬**（與 07 衝突時以 10 為準）、接下來的任務 |
| [DEVLOG](docs/DEVLOG.md) | 開發紀錄 |

## 技術棧

前端 Vite 6＋React 19 SPA＋Tailwind v4（Hallmark Hum 主題）；後端 Node＋Hono（`server/`）；Supabase（Postgres、Auth、Realtime、pgvector）、zod、OpenAI 相容 LLM API、vitest。
