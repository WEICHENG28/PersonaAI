// 共用常數（docs/07 第 6 節）。擁有者：B。數值調整請記進 DEVLOG。
export const CONFIG = {
  JUDGE_THRESHOLD: 70,             // 方向分數 ≥ 70 算合適
  JUDGE_RUNS: 3,                   // 判定 3 次取多數
  ROUNDS_PER_STEP: 4,              // worker 每一步跑幾輪代聊
  MIN_ROUNDS_BEFORE_JUDGE: 8,      // 至少聊幾輪才開始判定
  MAX_ROUNDS: 16,                  // 最多聊幾輪
  WORKER_INTERVAL_MS: 2000,
  LLM_MAX_RETRIES: 2,
  LLM_TIMEOUT_MS: 30000,
  TOOL_MAX_RETRIES: 1,
  TASK_MAX_FAILS: 3,               // 連續失敗幾次就暫停任務
  FRIEND_HISTORY_LIMIT: 20,        // AI 朋友聊天帶入幾則歷史訊息
  MEMORY_LIMIT: 50,               // 「它記得的事」最多列幾筆（A3）
  PROFILE_EXTRACT_EVERY: 6,        // 用戶每說幾則話更新一次檔案
  LOBBY_INVITE_MIN_MESSAGES: 8,    // 和阿澈說滿幾句、對外檔案也夠完整，才邀請真人進大廳
  ANOMALY_MIN_MESSAGES: 15,
  ANOMALY_CHECK_EVERY: 5,
  SEED_AUTO_RESPONSE: 'later',     // 種子用戶被請求真人時的自動回覆
  CRISIS_RESOURCE: '（依地區填寫求助專線）',
  // B11：評審六項指標依找人目的加權（02 F13）。交友等權重；其他目的加重「條件符不符合」與該目的在意的項目
  JUDGE_WEIGHTS: {
    friend: { topic_fit: 1, engagement: 1, values: 1, humor: 1, smoothness: 1, condition_fit: 1 },
    study: { topic_fit: 1, engagement: 1, values: 1, humor: 0.5, smoothness: 1, condition_fit: 2 },
    sport: { topic_fit: 1, engagement: 1.2, values: 0.8, humor: 0.8, smoothness: 1, condition_fit: 2 },
    hobby: { topic_fit: 1.5, engagement: 1, values: 0.8, humor: 1, smoothness: 1, condition_fit: 1.5 },
  },
} as const
