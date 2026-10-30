// 共用型別：照 docs/07_開發分工.md 第 5 節逐字。修改前三人同意（共用檔）。
export type Purpose = 'friend' | 'study' | 'sport' | 'hobby'
export type MatchTier = 'one_way' | 'mutual'
export type Controller = 'human' | 'twin'
export type AgentName = 'friend' | 'social' | 'twin' | 'judge' | 'guard'
export type ReasonType = 'not_mutual' | 'condition_mismatch' | 'friction'
export type AttemptResult = 'mutual' | 'one_way' | 'unsuitable' | 'ongoing'
export type VerdictValue = 'suitable' | 'unsuitable' | 'uncertain'
export type TaskStatus = 'pending_confirm' | 'running' | 'done' | 'paused' | 'failed' | 'cancelled'
export type ModelRole = 'chat' | 'reason' | 'fast'

// ---- 用戶檔案（A 產生）----
export interface ShareableProfile {
  intro: string            // 一句話介紹，20 字內
  interests: string[]
  chat_style: string
  looking_for: string
}
export interface StyleProfile {
  sentence_length: 'short' | 'medium' | 'long'
  tone: string
  emoji_level: 0 | 1 | 2 | 3
  formality: 'casual' | 'neutral' | 'formal'
}
export interface TraitScore { score: number; confidence: number; evidence: string } // score 0–100, confidence 0–1
export interface AgentProfile {
  big_five: Record<'O' | 'C' | 'E' | 'A' | 'N', TraitScore>
  values: string[]
  style: StyleProfile
}
export interface Preferences { personality: 'similar' | 'complementary'; conditions: string[] }

// ---- 任務（B）----
export interface DoneCondition { suitable_count?: number; max_chats?: number; deadline?: string | null }
export interface TaskProgress { screened: number; chats: number; suitable: number }
export interface ParsedTask {
  purpose: Purpose
  conditions: string[]
  count: number
  done: DoneCondition
  restatement: string
}
export interface AgentTask {
  id: string
  user_id: string
  kind: 'search' | 'single'
  raw_instruction: string | null
  restatement: string | null
  purpose: Purpose
  conditions: string[]
  target_count: number
  done_condition: DoneCondition
  target_user_id: string | null
  status: TaskStatus
  progress: TaskProgress
  active_conversation_id: string | null
  attempted_user_ids: string[]
}
export interface LobbyQuery { text?: string; purpose?: Purpose; conditions?: string[]; excludeIds?: string[]; limit?: number }
export interface LobbyCandidate { user_id: string; display_name: string; shareable: ShareableProfile; similarity: number }

// ---- 判定（B）----
export interface JudgeScores {
  topic_fit: number; engagement: number; values: number
  humor: number; smoothness: number; condition_fit: number   // 各 1–5
}
export interface FitPoint {
  concern: string                  // 這個視角的人在意的條件或特質，例：「喜歡登山、個性慢熱」
  evidence: string                 // 對話中的具體表現（已過隱私守門）
  round: number                    // 出現在第幾輪，結果頁用來跳到對話紀錄
}
// 每個視角各一份：highlights 是「對方」的亮點；fit_points 只在該視角判定 suitable 時有值
export interface Outline {
  topics: string[]; fits: string[]; frictions: string[]; highlights: string[]
  fit_points: FitPoint[]           // 最多 3 點
}
export interface Verdict {
  perspective_user_id: string
  direction_score: number          // 0–100
  verdict: VerdictValue
  reason_type: ReasonType | null
  reason_text: string | null
  outline: Outline                 // 這個視角的大綱；只給這個視角的用戶看
}
export interface Evaluation { a: Verdict; b: Verdict; round: number }
export interface TaskReport {
  task_id: string
  purpose: Purpose
  screened: number
  chats: number
  suitable: { user_id: string; display_name: string; mutual: boolean; conversation_id: string }[]
  unsuitable_reasons: { reason_type: ReasonType; reason_text: string }[]
  saved_minutes: number
  basis: string                    // 例：「代聊 6 場 × 人工平均 20 分鐘」
}

// ---- 對話（C）----
export interface ChatMessage {
  id: string; conversation_id: string; sender_id: string
  is_ai: boolean; content: string; created_at: string
}
export interface StartConversationInput {
  aUserId: string
  bUserId: string
  aController: Controller          // b 方一律從 twin 開始
  origin: 'auto' | 'manual'
  taskId?: string
  openingTopic?: string
}
export interface GuardResult { ok: boolean; text: string; issues: string[] }  // text = 可送出的版本

// ---- 共用 ----
export interface AgentLogInput {
  user_id: string
  agent: AgentName
  action: string
  reason?: string
  task_id?: string
  conversation_id?: string
  detail?: Record<string, unknown>
}
