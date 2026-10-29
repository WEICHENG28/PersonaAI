# PersonaAI｜07B 成員 B：社交 Agent 線

> 回到 [07 開發分工](07_開發分工.md)（共用規格：技術棧、資料表、型別、跨線函式）｜ 其他線：[07A AI 朋友線](07A_AI朋友線.md) ｜ [07C 分身與大廳線](07C_分身與大廳線.md)

**負責**：Agent 的大腦，包括接任務、挑人、判定、決策和回報。產品邏輯見 [02](02_核心邏輯與功能.md) 第 4 節、F4、F6、F8、F12、F13、第 6 節。
**Agent**：社交 Agent、評審 Agent。**Prompt**：4、6、14。**共用地基**：LLM 呼叫封裝、寫日誌、設定常數。

---

## 0. 如何開發（成員 B）

共通流程（設定、分支、測試、commit、PR）見 [07 第 0 節](07_開發分工.md)。B 這條線要注意：

1. **B0 最優先**：A 和 C 的每個 Prompt 都要經過 `lib/llm`，所以這是三人都在等的東西。
2. **M1（前 4 小時）要交出**：`lib/llm`、`lib/log.ts`、`lib/config.ts`、`lib/contracts/social.ts` 的 stub。
3. **之後依序開發 B1 → B10**，有空再做 B11。B3 是核心：先用 C 的 stub 把整個迴圈跑通，再接真的分身。
4. **跟別條線對接**

   | 你要用的 | 來自 | 還沒好之前 |
   |---------|------|-----------|
   | `startConversation`、`runTwinRounds`、`getTranscript`、`endConversation`、`markWaitingHuman`、`guardText` | C | 用 C 的 stub（假對話） |
   | `getAgentProfile`、`getShareableProfile`、`deliverReport` | A | 用 A 的 stub（假檔案） |
   | 種子用戶 | C | 用 `fixtures/lobby.ts` |

   | 你要提供的 | 給誰 | 什麼時候換成真的 |
   |-----------|------|----------------|
   | `lib/llm`、`writeLog`、`CONFIG` | A、C | B0 |
   | `createTaskFromText`、`<TaskConfirmCard/>` | A、C | B1 |
   | `searchLobby` | C | B2 |
   | `createSingleTargetTask` | C | B3 |
   | `<AgentLogPanel/>` | A | B7 |
   | `<SocialSettings/>` | A | B10 |

5. **自己測試**
   - 先不開 worker，用 `POST /api/tasks/[id]/step` 一步一步推進，打開開發者開關，看每一步的日誌和理由是否合理。
   - 評審：準備兩段固定對話放在 `fixtures/`（一段聊得來、一段有明顯摩擦），各跑 5 次，確認判定穩定。
   - 最後開 worker，從交辦任務到回報完整跑一次。
6. **第一個交給 Agent 的指令**

   ```text
   你是 PersonaAI 的開發者，負責成員 B 的社交 Agent 線。
   先讀 AGENTS.md、docs/07_開發分工.md 全部、docs/07B_社交Agent線.md，以及 docs/02_核心邏輯與功能.md 的第 4 節、F4、F6、F8、F12、F13、第 6 節。
   這次只做任務 B0，照 07B 裡 B0 的做法實作，先寫必測的測試再實作，最後執行 npm test。完成後逐條回報結果。
   需要修改共用檔或文件沒寫清楚時，先停下來問我。
   ```

---

## 1. 任務清單（依順序開發）

| ID | 任務 | 優先 | 依賴 | 時段 |
|----|------|------|------|------|
| B0 | LLM 封裝、寫日誌、設定常數、contracts stub | P0 | A0 | 0–4h |
| B1 | 一句話任務解析＋任務確認卡 | P0 | B0 | 4–8h |
| B2 | 搜尋大廳 `searchLobby` | P0 | B0、C0 的種子用戶 | 8–10h |
| B3 | Agent 迴圈 `runTaskStep`＋worker | P0 | B1、B2、C 的 stub | 10–16h |
| B4 | 規劃器（挑人、決策） | P0 | B3 | 16–20h |
| B5 | 評審（3 次共識、檔位判定） | P0 | B3 | 20–25h |
| B6 | 歷史嘗試＋重啟對話 | P0 | B5 | 25–28h |
| B7 | 工作日誌面板（開發者開關） | P0 | B0 | 28–31h |
| B8 | 效率統計＋任務結果回報 | P0 | B5 | 31–34h |
| B9 | 異常處理 | P0 | B3 | 34–37h |
| B10 | 任務頁＋`<SocialSettings/>` | P0 | B8 | 37–40h |
| B11 | 找人目的（F13） | P1 | B5 | 有空再做 |

---

## 2. 任務細節

### B0｜共用地基（M1 交付）

1. **`lib/llm/index.ts`**：實作 07 第 6 節的 `llmText`、`llmJson`、`embed`。
   - 用 `openai` 套件，`baseURL = LLM_BASE_URL`；`role` 對應 `MODEL_CHAT` / `MODEL_REASON` / `MODEL_FAST`。
   - `llmJson`：先要求 `response_format: { type: 'json_object' }`；平台不支援時，從回應中擷取第一段 `{…}` 再 `JSON.parse`；接著用 zod 驗證。
   - 逾時（`LLM_TIMEOUT_MS`）、解析失敗、schema 不符都會重試，最多 `LLM_MAX_RETRIES` 次；重試時在 messages 最後補一句「上次輸出格式錯誤：{錯誤}，請只輸出符合格式的 JSON」。
   - 全部失敗時丟出 `LlmError { role, reason, attempts }`。
   - `embed(text)`：呼叫 embeddings API，`model = MODEL_EMBED`、`dimensions = EMBEDDING_DIM`；回傳長度不符就丟錯。
2. **`lib/log.ts`**：`writeLog(entry)` 寫入 `agent_logs`；寫入失敗只在伺服器 console 記錯誤，不中斷主流程。
3. **`lib/config.ts`**：07 第 6 節的 `CONFIG`。
4. **`lib/contracts/social.ts`** stub：`createTaskFromText` 回傳固定任務、`searchLobby` 回傳 `fixtures/lobby.ts`。

**必測**：`extractJson(text)`（從混雜文字中擷取 JSON）、重試次數、schema 不符時會重試。

---

### B1｜一句話任務解析＋任務確認卡

- `lib/social/task.ts`：`createTaskFromText(userId, text)`
  1. 呼叫 Prompt 14（`MODEL_REASON`）得到 `ParsedTask`。
  2. 寫入 `agent_tasks`（`status = 'pending_confirm'`、`raw_instruction = text`、`restatement`、`purpose`、`conditions`、`target_count = count`、`done_condition = done`）。
  3. 寫日誌：`收到任務：{restatement}`。
- API：
  - `POST /api/tasks`，`{ text }`：給大廳 AI 助手用，回傳任務。
  - `GET /api/tasks/[id]`：任務、進度、restatement。
  - `POST /api/tasks/[id]/confirm`：檢查 `social_agent_enabled` 與 `shareable_confirmed`；不符合就回 `{ ok: false, error: '先到「我的檔案」確認對外檔案，並在設定開啟社交 Agent' }`；符合就改成 `running`。
  - `POST /api/tasks/[id]/cancel`、`/pause`、`/resume`。
- 元件 `components/social/TaskConfirmCard.tsx`，props `{ taskId }`：顯示複述、目的、條件、人數、完成條件；按鈕「開始」「取消」。

**驗收**
- [ ] 「幫我找 3 個喜歡登山的人聊聊」解析為目的 sport、條件「喜歡登山」、3 人、找到 2 位合適就停、最多代聊 6 場。
- [ ] 沒確認對外檔案時按「開始」，會看到明確的中文提示。

---

### B2｜搜尋大廳 `searchLobby`

`lib/social/lobby.ts`：`searchLobby(userId, q)`

1. 候選人：`social_agent_enabled = true`、`shareable_confirmed = true`、`id ≠ userId`、不在 `q.excludeIds`、`purposes` 和任務目的有交集（目的是 friend 時不篩）。
2. 排序：用 `embed(q.text 或 條件＋目的)` 和候選人的 `embedding` 算 cosine similarity；條件關鍵字有出現在對方 interests 的再加 0.1。
3. 回傳前 `q.limit`（預設 5）位的 `LobbyCandidate`。
4. 寫日誌：`搜尋大廳：{條件} → 找到 N 位`，reason 寫篩選依據。

可以用 SQL 的 `embedding <=> query_vector` 計算，或在程式端算（種子用戶只有 10 位）。

**必測**：`cosineSimilarity`、`rankCandidates`（條件加分與排序）。

---

### B3｜Agent 迴圈＋worker

**`scripts/worker.ts`**：每 `WORKER_INTERVAL_MS` 撈出 `status = 'running'` 的任務，依序執行 `runTaskStep(taskId)`；同一任務上一步還沒跑完就跳過。開發時也可以用 `POST /api/tasks/[id]/step` 手動推進一步。

**`lib/social/runner.ts`：`runTaskStep(taskId)`**（每一步都要寫日誌）

```text
1. 讀取任務；不是 running 就結束。
2. 任務守門：
   - 達到完成條件（progress.suitable ≥ suitable_count，或 progress.chats ≥ max_chats，或超過 deadline）
     → finishTask(task, 'done')
   - 今天這位用戶已代聊場數 ≥ daily_chat_limit → finishTask(task, 'paused', '已達每日代聊上限')
3. 沒有進行中的對話（active_conversation_id 為 null）→ 規劃：
   - kind = single：目標就是 target_user_id
   - kind = search：searchLobby（排除 attempted_user_ids）→ progress.screened 累加
     → 規劃器 pick（B4）→ tool = finish 就 finishTask(task, 'done')
   - startConversation（C）；失敗重試 TOOL_MAX_RETRIES 次，仍失敗就把這位加進 attempted_user_ids、寫日誌、結束這一步
   - 寫回 active_conversation_id、attempted_user_ids、progress.chats + 1
4. 有進行中的對話 → 執行：
   - 對話已結束，或用戶已接手（我方 controller = human）→ 清空 active_conversation_id，結束這一步
   - runTwinRounds(conversationId, ROUNDS_PER_STEP)（C）
   - roundCount < MIN_ROUNDS_BEFORE_JUDGE → 結束這一步
5. 評估：evaluate(conversationId)（B5）
6. 決策：規劃器 decide（B4），結果經過 decideGuard 檢查
   - continue_chat → 結束這一步
   - notify_user → recordAttempt（mutual 或 one_way）、markWaitingHuman（C）、
                   新增 match 通知、progress.suitable + 1、清空 active_conversation_id
   - end_conversation → recordAttempt（unsuitable＋原因）、endConversation（C）、清空 active_conversation_id
7. 成功完成一步就把 fail_count 歸零。
```

**`finishTask(task, status, reason?)`**：更新狀態 → `buildReport(task)`（B8）→ `deliverReport(userId, report)`（A）→ 寫日誌。

**必測**：`isTaskDone(task, now)`、`reachedDailyLimit(count, limit)`、runner 的分支（mock C 和 LLM，測「未滿 8 輪不判定」「合適就通知」「不合適就結束並記錄」）。

---

### B4｜規劃器

`lib/social/planner.ts`

- `pick(task, me, candidates)` → Prompt 4 的 pick 模式（`MODEL_REASON`）。輸入包含我的 `agent_profile`（可以用 Big Five 推理）和候選人的對外檔案。
  - 驗證：`target_user_id` 必須在候選清單內，否則視為失敗並重試一次；再失敗就選相似度最高的那位，日誌註明「規劃器輸出無效，改用相似度最高者」。
- `decide(ctx)` → Prompt 4 的 decide 模式。
- `decideGuard(action, ctx)`：程式規則優先，和 LLM 不一致時以程式為準，並在日誌註明。

| 狀況 | 程式規定的動作 |
|------|---------------|
| 任一方 uncertain 且輪數 < MAX_ROUNDS | continue_chat |
| 任一方 uncertain 且輪數 ≥ MAX_ROUNDS | end_conversation（原因：friction，「聊得不夠深，無法判斷」） |
| 符合檔位（見 B5 的 `isNotifiable`） | notify_user |
| 其他 | end_conversation |

**必測**：`decideGuard` 的四種狀況。

---

### B5｜評審

`lib/social/judge.ts`：`evaluate(conversationId): Promise<Evaluation>`

1. 取完整對話（`getTranscript`）、雙方的偏好、目的、對外檔案。
2. 對 **雙方視角各跑 `JUDGE_RUNS` 次** Prompt 6（`MODEL_REASON`，temperature 0.7），可以平行呼叫。
3. 每次的方向分數：`direction_score = round(avg(scores) × 20)`（MVP 六個指標等權重）。
4. 每次的判定：模型回 `enough_info = false` → uncertain；否則 `direction_score ≥ JUDGE_THRESHOLD` → suitable，反之 unsuitable。
5. `aggregateRuns(runs)`：三次中有 2 次以上相同就取那個；三次都不同 → uncertain。分數取多數那幾次的平均。不合適原因取多數那幾次中第一個非 null 的。
6. 寫入 `match_scores`（兩筆，各一個視角）；寫日誌：`第 N 輪：你的視角合適、對方視角不合適（3 次判定：2 合適 1 不合適）`。
7. `outline` 取我方視角第一次的結果。

**檔位與結果**

```ts
isNotifiable(tier, mine, theirs):
  one_way → mine === 'suitable'
  mutual  → mine === 'suitable' && theirs === 'suitable'

attemptResult(mine, theirs):
  兩邊都 suitable → 'mutual'
  只有我方 suitable → 'one_way'
  其他 → 'unsuitable'

unsuitableReason(mine, theirs):
  我方 suitable、對方不是 → 'not_mutual'
  其他 → 我方判定的 reason_type（沒有就 'friction'）
```

**必測**：`directionScore`、`aggregateRuns`（3 種多數情況＋全部不同）、`isNotifiable`、`attemptResult`、`unsuitableReason`。

---

### B6｜歷史嘗試＋重啟對話

- `recordAttempt(...)`：寫入 `match_attempts`。對方不是種子用戶時，也幫對方寫一筆（用對方視角的判定）。`reason_text` 寫入前先經過 C 的 `guardText`。
- `app/history/page.tsx`：列出所有嘗試（對象卡片、時間、發起方式、結果、抽象原因、對話大綱）；**不顯示任何分數**。
- 累積 3 筆以上不合適時，頁面上方顯示 AI 朋友的觀察（從原因類型統計，例：「最近 5 次沒成的裡面，有 3 次是對方偏好節奏比較慢的人。這不是誰的錯，只是剛好不同步。」），用固定模板產生即可。
- 「重啟對話」`POST /api/history/[id]/reopen`，`{ mode: 'twin' | 'human' }`：
  - twin → `createSingleTargetTask(userId, targetUserId)`
  - human → `startConversation({ aController: 'human', origin: 'manual', … })`，回傳對話 ID，前端導向 `/chat/[id]`
  - 設定 `reopened_at`。

---

### B7｜工作日誌面板（開發者開關）

- `components/social/AgentLogPanel.tsx`：A 的版面在 `dev_mode = true` 時顯示於右側抽屜（手機版為底部抽屜）。
- 初始載入最新 50 筆，之後訂閱 `agent_logs` 的 Realtime。
- 每筆顯示：`14:02 社交 Agent｜選擇 B｜理由：價值觀相近`；不同 Agent 用不同顏色標籤（friend / social / twin / judge / guard）。
- 可以依任務篩選；點對話 ID 可以跳到聊天室。

---

### B8｜效率統計＋任務結果回報

`lib/social/stats.ts`

```ts
computeStats(progress, manualMinutesPerChat) → {
  screened, chats, suitable,
  saved_minutes: chats × manualMinutesPerChat,
  basis: `代聊 ${chats} 場 × 人工平均 ${manualMinutesPerChat} 分鐘`
}
buildReport(task) → TaskReport   // 從 match_attempts 取合適名單與不合適原因
```

- 元件 `components/social/StatsCard.tsx`：顯示四個數字和計算依據，例如「省下約 2 小時（代聊 6 場 × 人工平均 20 分鐘）」；分鐘數換算成小時、分鐘。
- 判定合適時，新增 `match` 通知（payload：`{ conversationId, targetName, mutual }`），由 C 的通知元件顯示。

**必測**：`computeStats`、`formatDuration(120) === '約 2 小時'`、`buildReport` 不含分數。

---

### B9｜異常處理

| 狀況 | 處理 | 日誌 |
|------|------|------|
| LLM 逾時或格式錯誤 | `lib/llm` 自動重試 | 重試全部失敗時記一筆 |
| 工具呼叫失敗（C 的函式丟錯） | 重試 1 次，仍失敗就跳過該候選人 | 「跳過 B：發起對話失敗」 |
| 對方是種子用戶或不在線，需要本人 | 由 C 處理成「稍後聊」 | C 記錄 |
| 判定不確定 | 繼續聊，直到 MAX_ROUNDS | 「判定不一致，多聊幾輪」 |
| 達到每日上限或完成條件 | 停止任務，回報 | 「任務完成，回報給你」 |
| 同一任務連續失敗 `TASK_MAX_FAILS` 次 | 任務改為 paused | 「連續失敗，先暫停任務」 |

runner 的每一步都包在 try/catch：失敗時 `fail_count + 1`、寫日誌，不讓 worker 停掉。

---

### B10｜任務頁＋設定元件

- `app/tasks/[id]/page.tsx`：任務複述、狀態、進度條（合適人數 / 目標）、`StatsCard`、目前對話的連結、暫停 / 繼續 / 取消按鈕；訂閱 `agent_tasks` 的 Realtime。
- `components/social/SocialSettings.tsx`（放在 A 的設定頁）：檔位（單向 / 雙向合適，附說明：單向機會較多、雙向成功率較高）、找人目的（P1）、每日代聊上限（1–20）、人工平均聊天時間（5–60 分鐘）。API `PUT /api/settings/social`。

---

### B11｜找人目的（P1）

- `searchLobby` 只配對同樣開啟該目的的人（已在 B2 實作篩選）。
- 規劃器的開場話題依目的調整（Prompt 4 已帶入目的）。
- 評審權重依目的調整：`CONFIG` 加上 `JUDGE_WEIGHTS`，例如 study 時 `condition_fit × 2`、`humor × 0.5`；`directionScore` 改成加權平均。

---

## 3. Prompt 全文

### Prompt 14｜任務解析（`prompts/14_task.ts`，MODEL_REASON，temperature 0）

```text
把用戶的一句話轉成找人任務。

規則：
- purpose 只能是 friend / study / sport / hobby；聽不出來就用 friend。
- conditions 只放用戶明說的條件，不要自己加。
- count 預設 3，上限 10。
- done.suitable_count 預設為 min(count, 2)；done.max_chats 預設為 count × 2；done.deadline 沒說就是 null。
- restatement 用一句繁體中文複述給用戶確認，例如：「幫你找 3 位喜歡登山的運動夥伴，找到 2 位合適就停，最多代聊 6 場，可以嗎？」

輸入：{{text}}
只輸出 JSON：
{"purpose": "sport", "conditions": ["喜歡登山"], "count": 3, "done": {"suitable_count": 2, "max_chats": 6, "deadline": null}, "restatement": "…"}
```

### Prompt 4｜社交 Agent 規劃器（`prompts/04_planner.ts`，MODEL_REASON，temperature 0.3）

**pick 模式**

```text
你是社交 Agent，替用戶執行找人任務。從候選人中選出下一位要派分身去聊的人。

規則：
- 只能從候選人清單中選。
- reason 要具體：說明對方符合哪個任務條件，或雙方哪裡相近／互補；不可寫出任何分數數字。
- opening_topic 是雙方共同興趣中的一個具體話題，配合找人目的。
- 沒有合適的候選人就選 finish。

輸入：
- 任務：{{task}}
- 用戶的偏好與後台檔案：{{me}}
- 候選人：{{candidates}}

只輸出 JSON，二選一：
{"tool": "start_conversation", "args": {"target_user_id": "…", "opening_topic": "…"}, "reason": "…"}
{"tool": "finish", "args": {}, "reason": "…"}
```

**decide 模式**

```text
你是社交 Agent。根據評審結果決定這段代聊的下一步。

可用工具：
- continue_chat：資訊還不夠，繼續聊
- notify_user：符合用戶選的檔位，通知本人
- end_conversation：不合適，禮貌結束

規則：
- 任一方判定為 uncertain，且目前輪數小於最大輪數 → continue_chat
- 檔位 one_way：用戶視角 suitable → notify_user
- 檔位 mutual：雙方視角都 suitable → notify_user
- 其他 → end_conversation
- reason 用一句話說明，不可寫出對方視角的分數。

輸入：{{ctx}}（檔位、雙方判定、目前輪數、最大輪數、任務進度）
只輸出 JSON：{"tool": "…", "args": {}, "reason": "…"}
```

### Prompt 6｜評審（`prompts/06_judge.ts`，MODEL_REASON，temperature 0.7）

```text
你是評審 Agent。站在「{{perspective_name}}」的角度，判斷對方適不適合他。

輸入：
- {{perspective_name}} 的找人目的：{{purpose}}
- {{perspective_name}} 的偏好與條件：{{preferences}}
- 對方的對外檔案：{{other_shareable}}
- 對話紀錄（雙方都是分身，代表各自的說話風格與對外資料）：
{{transcript}}

各項 1–5 分（整數）：
- topic_fit：話題是否自然延伸、互相追問
- engagement：回應是否積極（回覆長度、提問比例）
- values：對事情的看法是否契合
- humor：玩笑接不接得住（沒有出現幽默就給 3）
- smoothness：對話順不順（冷場、敷衍、觀點衝突越多分數越低）
- condition_fit：對方符不符合 {{perspective_name}} 列出的條件（沒有條件就給 3）

enough_info：對話內容不足以判斷時為 false。
reason_type 與 reason_text：只在你認為不合適時填寫。reason_type 為 condition_mismatch（對方特點不符合條件）或 friction（冷場、敷衍、觀點衝突）；reason_text 用抽象特質描述，不提對方的具體事件與個資，30 字內。
outline：這段對話的大綱，各項最多 3 點。

只輸出 JSON：
{
  "scores": {"topic_fit": 4, "engagement": 4, "values": 3, "humor": 3, "smoothness": 4, "condition_fit": 5},
  "enough_info": true,
  "reason_type": null,
  "reason_text": null,
  "outline": {"topics": ["…"], "fits": ["…"], "frictions": ["…"], "highlights": ["…"]}
}
```

---

## 4. B 的 API 一覽

| 方法 | 路徑 | 用途 |
|------|------|------|
| POST | `/api/tasks` | 建立任務（大廳 AI 助手用） |
| GET | `/api/tasks/[id]` | 任務、進度、複述 |
| POST | `/api/tasks/[id]/confirm` | 確認並開始 |
| POST | `/api/tasks/[id]/pause` / `resume` / `cancel` | 控制任務 |
| POST | `/api/tasks/[id]/step` | 手動推進一步（開發用） |
| GET | `/api/history` | 歷史嘗試 |
| POST | `/api/history/[id]/reopen` | 重啟對話 |
| GET | `/api/stats` | 今日效率統計 |
| PUT | `/api/settings/social` | 檔位、目的、上限、人工平均時間 |
