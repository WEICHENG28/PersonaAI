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
  PROFILE_EXTRACT_EVERY: 6,        // 用戶每說幾則話更新一次檔案
  ANOMALY_MIN_MESSAGES: 15,
  ANOMALY_CHECK_EVERY: 5,
  SEED_AUTO_RESPONSE: 'later',     // 種子用戶被請求真人時的自動回覆
  CRISIS_RESOURCE: '（依地區填寫求助專線）',
} as const
