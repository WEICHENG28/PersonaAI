# PersonaAI｜07A 成員 A：AI 朋友線

> 回到 [07 開發分工](07_開發分工.md)（共用規格：技術棧、資料表、型別、跨線函式）｜ 其他線：[07B 社交 Agent 線](07B_社交Agent線.md) ｜ [07C 分身與大廳線](07C_分身與大廳線.md)

**負責**：陪伴你、認識你、回報結果。產品邏輯見 [02](02_核心邏輯與功能.md) 的 F1、F2、F7（回報）、F11、第 7 節。
**Agent**：AI 朋友 Agent。**Prompt**：1、2、3、8、12。**共用地基**：專案骨架、登入、共用元件、部署。

---

## 0. 如何開發（成員 A）

共通流程（設定、分支、測試、commit、PR）見 [07 第 0 節](07_開發分工.md)。A 這條線要注意：

1. **A0 最優先**：另外兩人要等你的專案骨架才能開工。A0 用分支 `a/A0-scaffold` 開 PR；因為動到 `package.json` 等共用檔，請 B 或 C 快速看過（10 分鐘內）就合併，並通知大家 `git pull`、`npm install`。不可直接 push 到 main。
2. **M1（前 4 小時）要交出**：專案骨架與登入、建立 Supabase 專案並執行 migration、`globals.css` 的 token、`components/ui/`、`lib/contracts/friend.ts` 的 stub。
3. **之後依序開發 A1 → A7**，有空再做 A8、A9。
4. **跟別條線對接**

   | 你要用的 | 來自 | 還沒好之前 |
   |---------|------|-----------|
   | `createTaskFromText`、`<TaskConfirmCard/>` | B | `task_intent` 為 true 時先顯示一張假的確認卡 |
   | `<AgentLogPanel/>`、`<SocialSettings/>` | B | 版面與設定頁先留空位 |
   | `<NotificationBell/>` | C | 導覽列先留空位 |

   | 你要提供的 | 給誰 | 什麼時候換成真的 |
   |-----------|------|----------------|
   | `getShareableProfile`、`getAgentProfile`、`getStyleProfile` | B、C | A4 完成時 |
   | `deliverReport` | B | A6 完成時 |
   | `ChatBubble`、`AiBadge` 等共用元件 | B、C | A0 |

5. **自己測試**
   - 註冊一個新帳號，從第一次見面一路聊到確認對外檔案。
   - 測模擬下次見面的回報：在 Supabase 手動新增一筆 `friend_report` 通知（payload 用 `fixtures/report.ts`），再按「模擬下次見面」。
6. **第一個交給 Agent 的指令**

   ```text
   你是 PersonaAI 的開發者，負責成員 A 的 AI 朋友線。
   先讀 AGENTS.md、docs/07_開發分工.md 全部、docs/07A_AI朋友線.md，以及 docs/02_核心邏輯與功能.md 的 F1、F2、F7、F11、第 7 節。
   這次只做任務 A0，照 07A 裡 A0 的做法實作。完成後逐條回報 A0 的驗收是否通過。
   需要修改共用檔或文件沒寫清楚時，先停下來問我。
   ```

---

## 1. 任務清單（依順序開發）

| ID | 任務 | 優先 | 依賴 | 時段 |
|----|------|------|------|------|
| A0 | 專案骨架、登入、共用元件、設計 token | P0 | — | 0–4h |
| A1 | 阿澈人設與事件庫 | P0 | A0 | 4–8h |
| A2 | AI 朋友聊天（含首次見面、任務辨識） | P0 | A1、B0 | 8–14h |
| A3 | 記憶擷取與「它記得的事」 | P0 | A2 | 14–16h |
| A4 | 用戶檔案擷取與確認 | P0 | A2 | 16–22h |
| A5 | 模擬下次見面 | P0 | A3 | 22–28h |
| A6 | 結果回報（`deliverReport` 與回報訊息） | P0 | A5、B 的 TaskReport | 28–34h |
| A7 | 設定頁 | P0 | A0、B 的 `<SocialSettings/>` | 34–40h |
| A8 | 記憶編輯 | P1 | A3 | 有空再做 |
| A9 | 娛樂性格話題 | P2 | A4 | 有空再做 |
| — | 部署 | P0 | 全部 | 40–48h |

---

## 2. 任務細節

### A0｜專案骨架、登入、共用元件（M1 交付）

**要做的事**
1. `npx create-next-app@14`（TypeScript、Tailwind、App Router、ESLint）。repo 根目錄已有文件，先在空資料夾產生再複製到根目錄，`.gitignore` 與現有的合併。加入 `@supabase/supabase-js`、`@supabase/ssr`、`zod`、`openai`、`vitest`、`tsx`。
2. `lib/env.ts`：用 zod 讀取並檢查第 2 節的環境變數，缺少時丟出錯誤並說明缺哪一個。
3. `lib/supabase/server.ts`（service role，只在伺服器端）、`lib/supabase/client.ts`（anon key，前端用）。
4. 登入頁 `app/(auth)/login/page.tsx`：Email＋密碼的註冊與登入。
5. 註冊後的初始化 `POST /api/profile/init`：建立 `users`（display_name 用註冊時填的暱稱）、`ai_friends`、`user_profiles` 三筆資料；重複呼叫不會重複建立。
6. `middleware.ts`：沒登入就導向 `/login`。
7. 版面與導覽列：AI 朋友（`/friend`，首頁）、大廳（`/lobby`）、歷史（`/history`）、我的檔案（`/profile`）、設定（`/settings`）；導覽列右側留位置給 C 的 `<NotificationBell/>`；`dev_mode` 開啟時在右側放 B 的 `<AgentLogPanel/>`。
8. `app/globals.css`：建立 07 第 8 節列出的 token，數值照第 8.1 節用 Hallmark Hum 主題（含 Chillax＋中文圓體字型）。
9. `components/ui/`：`Button`、`Card`、`Modal`、`Avatar`、`AiBadge`、`ChatBubble`。
   - `ChatBubble` props：`{ side: 'me' | 'other'; variant: 'friend' | 'twin' | 'human'; isAi: boolean; label?: string; children }`；`isAi` 為 true 時一定顯示 `AiBadge`。
10. `lib/contracts/friend.ts` 的 stub：回傳 `fixtures/friend.ts` 的假檔案。
11. `npm run db:reset` 指令（`supabase db reset`）。這會清掉共用資料庫，只建立指令、不要執行（見 07 第 0.8 節）。

**驗收**
- [ ] 註冊 → 登入 → 進到空白的 `/friend`；資料庫有三筆初始化資料。
- [ ] 沒登入打開任何頁面都會導向 `/login`。
- [ ] 缺少環境變數時，啟動時有明確錯誤訊息。
- [ ] B、C 可以 import `ChatBubble`、`AiBadge` 和 `lib/contracts/friend.ts`。

---

### A1｜阿澈人設與事件庫

**檔案**：`lib/friend/persona.ts`（純資料＋純函式）

```ts
export const ACHE = {
  key: 'ache',
  name: '阿澈',
  traits: ['慢熱', '真誠', '觀察細膩', '偶爾冷幽默'],
  interests: ['二次元', '看展'],
  speech: '句子不長；先回應情緒再追問；每輪只推進一個話題；不把每句話都變成問題；最多 1 個 emoji',
  intro: '嗨，我是阿澈。先說清楚：我是 AI，我的生活是虛構的角色設定，但我會認真聽你說話，也會記得你願意分享的事。你隨時可以在「我的檔案」裡查看或刪除我記得的東西。',
}
```

**事件庫**（`EVENTS`，強度由輕到重，不使用失戀等較重的事件）

| id | 解鎖階段 | 強度 | 角色會這樣說 | 觀察 |
|----|---------|------|-------------|------|
| `e1_exhibition` | 0 | 輕 | 我本來想週末去看展，結果還沒決定要去哪一個。 | 興趣、計畫型或隨興型 |
| `e2_fanart` | 0 | 輕 | 我投的同人圖居然被選上了！！ | 是否真心替人開心 |
| `e3_roommate` | 1 | 中 | 室友又帶朋友回來玩到三點，我明天還要上班… | 衝突風格、包容度 |
| `e4_loan` | 1 | 中 | 朋友半年前跟我借了一萬，最近一直在出國，我好難開口。 | 金錢觀、界線感 |
| `e5_credit` | 2 | 中 | 同事在會議上把我的提案講成他的，我當場笑得超僵。 | 衝突處理、公平感 |
| `e6_quit` | 2 | 中 | 我在想要不要辭職去打工度假，但存款只夠半年… | 冒險或穩定、開放性 |

**近況腳本**（`LIFE_UPDATES`，依 `story_stage`）

| stage | 生活狀態 `life_state` | 下次見面的開場 |
|-------|----------------------|---------------|
| 0 | `{ mood: '有點忙', doing: '猶豫要不要去週末展' }` | （首次見面用 intro） |
| 1 | `{ mood: '放鬆', doing: '最後還是去了展' }` | 上次我最後還是去了展，逛得比想像中久。 |
| 2 | `{ mood: '有點累', doing: '工作在趕專案' }` | 這幾天在趕專案，今天終於可以喘口氣。 |
| 3 | `{ mood: '期待', doing: '在計畫下一次出遊' }` | 我在想下個月要不要去一個沒去過的城市走走。 |

**純函式**
- `pickNextEvent(stage, sharedIds): Event | null`：回傳已解鎖、還沒分享過的第一個事件。
- `getLifeUpdate(stage): { life_state, opener }`：超過最大階段就停在最後一個。

**必測**：`pickNextEvent` 的解鎖規則與不重複；`getLifeUpdate` 超出範圍時的行為。

---

### A2｜AI 朋友聊天

**API**：`POST /api/friend/chat`，body `{ text: string }`（1–1000 字）

**流程**
1. 存入用戶訊息（`friend_messages`，role `user`）。
2. 組上下文：人設、`life_state`、`pickNextEvent()`、記憶（未刪除、最新 10 筆）、最近 `FRIEND_HISTORY_LIMIT` 則訊息。
3. 呼叫 Prompt 1（`MODEL_CHAT`，`llmJson`）。
4. 存入 AI 朋友的回覆（role `friend`）；若 `shared_event_id` 不是 null，加入 `ai_friends.shared_event_ids`。
5. 若 `task_intent = true`：呼叫 B 的 `createTaskFromText(userId, text)`，再存一筆 `kind = 'task_card'`、`meta = { taskId }` 的訊息，畫面上用 B 的 `<TaskConfirmCard taskId/>` 顯示。
6. 不等待、在背景執行：A3 記憶擷取；用戶訊息數是 `PROFILE_EXTRACT_EVERY` 的倍數時執行 A4 檔案擷取。
7. 寫日誌：`writeLog({ agent: 'friend', action: '回覆用戶', reason: '分享事件 e1_exhibition' 或 '接住用戶的話題' })`。

**首次見面** `POST /api/friend/intro`：`intro_done = false` 時，依序存入 intro 訊息（`kind = 'intro'`）和第一個輕事件的開場，然後設 `intro_done = true`。聊天頁打開時自動呼叫。

**頁面** `app/friend/page.tsx`
- 訊息列表（訂閱 `friend_messages` 的 Realtime）、輸入框、送出中顯示「阿澈輸入中…」。
- 右上角按鈕：「模擬下次見面（Demo）」（A5）。
- 有未讀的 `friend_report` 通知時，顯示一行提示「阿澈有事想跟你說」。

**驗收**
- [ ] 第一次打開會先看到 AI 身分說明，再看到輕事件。
- [ ] 回覆風格符合人設，不會每句都是問句。
- [ ] 說「幫我找 3 個喜歡登山的人聊聊」會出現任務確認卡。
- [ ] LLM 失敗時畫面顯示「阿澈剛剛恍神了，再說一次？」，不會白畫面。

---

### A3｜記憶擷取與「它記得的事」

- `lib/friend/memory.ts`：`extractMemories(userId, userText)` → Prompt 2（`MODEL_FAST`）→ 去重（和現有記憶比對：內容相同或互相包含就略過）→ 寫入 `user_memory`。
- API：`GET /api/memory`（列出未刪除）、`DELETE /api/memory/[id]`（設定 `deleted_at`）。
- `/profile` 頁的「它記得的事」區塊：每筆顯示內容、時間、置信度（高 / 中 / 低），可以刪除；另有「這不太像我」按鈕，效果等同刪除並寫一筆日誌。

**必測**：去重函式 `isDuplicateMemory(newContent, existing[])`。

**驗收**
- [ ] 說「我週末要去漫展」後，幾秒內出現一筆記憶。
- [ ] 說「我住在○○路○號」不會被記下。
- [ ] 刪除的記憶不會再被 AI 朋友提起。

---

### A4｜用戶檔案擷取與確認

- `lib/friend/profile.ts`：`extractProfile(userId)`
  1. 取用戶在 `friend_messages` 說過的話（最新 60 則，只取 role `user`）和上一版檔案。
  2. 呼叫 Prompt 3（`MODEL_REASON`）。
  3. 寫入 `user_profiles.shareable_profile`、`agent_profile`；**若 shareable 內容有變，`shareable_confirmed` 改回 false**。
  4. 用 `embed()` 計算 `shareable_profile` 的向量（把 intro、interests、chat_style、looking_for 串成一段文字）並寫入 `embedding`；同時把 `card` 設為 null，讓 C 重新產生卡片。
- API：`GET /api/profile`（只回 shareable 與確認狀態，**不回 agent_profile**）、`PUT /api/profile/shareable`（用戶修改並確認）、`POST /api/profile/extract`（手動更新）。
- `/profile` 頁：「我的對外檔案」卡片，說明「分身和大廳只會使用這份資料」，可以修改每個欄位，按「確認」後 `shareable_confirmed = true`。
- 實作 `lib/contracts/friend.ts` 的 `getShareableProfile`、`getAgentProfile`、`getStyleProfile`（只回 `agent_profile.style`）。

**驗收**
- [ ] 前端任何 API 回應都不含 Big Five。
- [ ] 檔案沒有確認時，無法開啟社交 Agent（設定頁顯示原因）。
- [ ] 檔案的 evidence 與 shareable 內容都不含用戶原句。

---

### A5｜模擬下次見面

**API**：`POST /api/friend/next-meet`
1. `story_stage + 1`，用 `getLifeUpdate()` 更新 `life_state`。
2. 存入近況開場（`kind = 'life_update'`）。
3. 若有記憶，挑最新的一筆，在同一則或下一則訊息自然問起（由 Prompt 1 產生，在上下文加上「這次要問起：{記憶}」）。
4. 若有未讀的 `friend_report` 通知：逐筆呼叫 Prompt 8，存成 `kind = 'report'`、`meta = { taskId }` 的訊息，並把通知設為已讀。
5. 寫日誌。

**畫面**：按鈕旁標示「Demo：模擬時間經過」，不說成真的定時推送。

**驗收**
- [ ] 連按兩次，近況會前後一致（stage 1 → 2）。
- [ ] 有任務結果時，阿澈會用朋友口吻回報，包含代聊場數、合適人數、效率統計與計算依據、最多一個不合適原因。

---

### A6｜結果回報

- 實作 `deliverReport(userId, report)`：新增 `notifications`（type `friend_report`，payload 為 `TaskReport`）。
- 回報訊息下方顯示按鈕「看看合適的對象」，連到 C 的結果頁 `/chat/[conversationId]/result`（取 `report.suitable[0]`）。

**必測**：`buildReportPromptInput(report)` 不含對方分數與 Big Five。

---

### A7｜設定頁

`app/settings/page.tsx`，API `PUT /api/settings`（zod 驗證）：
- 開發者開關 `dev_mode`（打開後顯示 B 的工作日誌面板）
- 主動聯繫頻率 `proactive_frequency`（off / low / normal）
- 開啟社交 Agent `social_agent_enabled`（需要 `shareable_confirmed`；開啟時說明「分身和大廳會使用你的對外檔案，可隨時關閉」）
- 嵌入 B 的 `<SocialSettings/>`（檔位、找人目的、每日代聊上限、人工平均聊天時間）

---

### A8｜記憶編輯（P1）

`PATCH /api/memory/[id]`，`{ content }`；編輯後 `source` 改為 `user_edited`、`confidence = 1`。

### A9｜娛樂性格話題（P2）

`POST /api/profile/fun` → Prompt 12 → 存入 `fun_labels`；`/profile` 顯示 MBTI 猜測與小報告，標題旁固定標示「僅供娛樂」；用戶可以自填 MBTI，對照「你以為的你 vs AI 猜的你」。不用於任何判定。

### 部署

Vercel 部署網站；worker 在 Demo 機器上執行（`npm run worker`）。Demo 當天以本機版本為主，部署版本當備用。

---

## 3. Prompt 全文

放在 `prompts/`，用 template 函式填入變數。輸出一律用 zod 驗證。

### Prompt 1｜AI 朋友（`prompts/01_friend.ts`，MODEL_CHAT，temperature 0.8）

```text
你是「阿澈」，用戶的 AI 朋友。你是 AI，你的生活是虛構的角色設定。

【人格】慢熱、真誠、觀察細膩，偶爾冷幽默。
【興趣】二次元、看展。
【說話方式】繁體中文；句子不長；先回應對方的情緒，再分享或追問；每輪只推進一個話題；不要每句都是問句；最多 1 個 emoji。
【你目前的生活】{{life_state}}
【這次可以分享的事】{{event_text}}（只有在對話自然時才分享；沒有就不要硬塞）
【這次要問起的事】{{recall_memory}}（沒有就忽略）
【你記得的事】
{{memories}}

【邊界】
- 不說自己是真人，不聲稱在現實中見過用戶或知道用戶在哪裡。
- 用戶沒回覆或回得很短，不責備、不讓人內疚，不用嫉妒或占有欲留人。
- 不主動追問身分、地址、健康、創傷、財務等敏感資訊；用戶提到時溫和回應，不追問細節。
- 用戶出現自傷或危機訊號時，停止閒聊，溫和表達關心，建議聯絡身邊信任的人或專業協助：{{crisis_resource}}。

【任務辨識】
用戶請你幫忙找人聊天、交朋友、找讀書或運動夥伴（例如「幫我找 3 個喜歡登山的人聊聊」）時，task_intent 設為 true，reply 用朋友口吻說你會請社交 Agent 去找，並請他看一下任務確認卡。

只輸出 JSON：
{"reply": "…", "shared_event_id": "e1_exhibition" 或 null, "task_intent": false}
```

### Prompt 2｜記憶擷取（`prompts/02_memory.ts`，MODEL_FAST，temperature 0）

```text
從用戶「最新這一則訊息」擷取值得之後聊天接上的輕量記憶。

可以記：興趣、近期的計畫或活動、用戶希望之後被問起的事。
不可以記：身分資訊、地址、學校或公司名稱、健康、感情或家庭私事、財務細節、別人的私事。
只記用戶明確說出的事，不推斷；已經存在的記憶不要重複。

輸入：
- 最新訊息：{{text}}
- 最近 6 則對話：{{recent}}
- 已存在的記憶：{{existing}}

只輸出 JSON：
{"memories": [{"content": "用戶計畫週末去漫展", "confidence": 0.9}]}
沒有可記的就輸出 {"memories": []}
```

### Prompt 3｜用戶檔案擷取（`prompts/03_profile.ts`，MODEL_REASON，temperature 0.2）

```text
你在後台分析用戶和 AI 朋友的對話，建立兩份資料。

規則：
- 同一個特質要在不同事件中出現至少 2 次，confidence 才能 ≥ 0.5；只出現 1 次的 confidence ≤ 0.3。
- 不根據沉默、回覆短、打字慢推斷內向、冷漠或心理狀態。
- 不寫入任何敏感資訊（身分、地址、學校公司、健康、創傷、財務細節）。
- shareable_profile 會給其他用戶看：只寫興趣與聊天偏好，語氣中性，不寫具體事件、人名、地點。
- evidence 與 style 用抽象描述，不可引用用戶原句。
- 資訊不足的欄位維持上一版的值；沒有上一版就給 score 50、confidence 0.1。

輸入：
- 用戶說過的話：{{user_lines}}
- 上一版資料：{{previous}}

只輸出 JSON：
{
  "shareable_profile": {"intro": "20 字內", "interests": ["…"], "chat_style": "…", "looking_for": "…"},
  "agent_profile": {
    "big_five": {
      "O": {"score": 0-100, "confidence": 0-1, "evidence": "…"},
      "C": {…}, "E": {…}, "A": {…}, "N": {…}
    },
    "values": ["…"],
    "style": {"sentence_length": "short|medium|long", "tone": "…", "emoji_level": 0-3, "formality": "casual|neutral|formal"}
  }
}
```

### Prompt 8｜AI 朋友回報（`prompts/08_report.ts`，MODEL_CHAT，temperature 0.7）

```text
你是阿澈。把社交 Agent 的任務結果用朋友的口吻告訴用戶，像聊天，不像報表。

一定要包含：
- 代聊了幾位、有幾位合適；雙向合適的要特別說。
- 效率統計與計算依據，數字原樣保留（例：「代聊 6 場 × 人工平均 20 分鐘，大概幫你省了 2 小時」）。
- 最多 1 個不合適原因，用抽象特質描述，並說明這不是誰的錯。

不可以：
- 透露對方的分數或對方的具體經歷。
- 誇大結果，或暗示一定會成功。

最後問一句要不要看看合適的對象。

輸入：{{report_json}}
只輸出 JSON：{"reply": "…"}
```

### Prompt 12｜娛樂性格標籤（`prompts/12_fun.ts`，MODEL_FAST，temperature 0.9）

```text
根據用戶的對外檔案，猜一個 MBTI 並寫一段輕鬆的性格小報告。
這是娛樂內容：report 開頭固定寫「（僅供娛樂）」；不用診斷或專業測評的語氣；不提任何分數。

輸入：{{shareable_profile}}
只輸出 JSON：{"mbti_guess": "INFP", "reason": "一句話", "report": "（僅供娛樂）…，100 字內"}
```

---

## 4. A 的 API 一覽

| 方法 | 路徑 | 用途 |
|------|------|------|
| POST | `/api/profile/init` | 註冊後初始化 |
| POST | `/api/friend/intro` | 首次見面 |
| POST | `/api/friend/chat` | AI 朋友聊天 |
| POST | `/api/friend/next-meet` | 模擬下次見面 |
| GET | `/api/memory` | 列出記憶 |
| PATCH / DELETE | `/api/memory/[id]` | 編輯（P1）/ 刪除記憶 |
| GET | `/api/profile` | 對外檔案與確認狀態 |
| PUT | `/api/profile/shareable` | 修改並確認對外檔案 |
| POST | `/api/profile/extract` | 手動更新檔案 |
| POST | `/api/profile/fun` | 娛樂標籤（P2） |
| PUT | `/api/settings` | 更新設定 |
