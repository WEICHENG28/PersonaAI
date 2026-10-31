/** API 接缝：demo 目前用 MockApi，未来换 HttpApi 打真后端（Supabase）。 */

// ── 基础型别 ──

export interface User {
  id: string
  email: string
  nickname: string
}

/** 记忆（02 §F2：内容、来源、时间、置信度） */
export interface Memory {
  id: string
  content: string
  source: string
  createdAt: number
  confidence: 'low' | 'mid' | 'high'
}

/** 对外档案（shareable_profile，02 §7.1） */
export interface ShareableProfile {
  intro: string
  interests: string[]
  chatStyle: string
  mbti?: string
  confirmed: boolean
}

/** 一句话交辦的结构化任务（02 §F12） */
export interface AgentTask {
  id: string
  goal: string
  condition: string
  count: number
  doneWhen: string
  status: 'running' | 'done' | 'paused'
  progress: number
  dailyChats: number
}

/** 聊天讯息（朋友线 or 代聊线） */
export type Speaker = 'friend' | 'human' | 'twin' | 'other-twin'

export interface ChatMessage {
  id: string
  speaker: Speaker
  text: string
  at: number
  /** 代聊：第几轮 */
  round?: number
  /** 隐私守门改写过 */
  privacyRewrite?: boolean
}

/** 评审判定（02 §F6）：双方视角各一份 */
export interface Verdict {
  round: number
  mine: number
  theirs: number
  trend: 'up' | 'flat' | 'down'
  reason: string
}

/** 结果页（02 §F5） */
export interface FitPoint {
  id: string
  text: string
  round: number
}

export interface Outline {
  topics: string[]
  fitPoints: string[]
  frictionPoints: string[]
  highlights: string[]
}

export interface MatchResult {
  id: string
  taskId: string
  withName: string
  result: 'mutual' | 'one-way' | 'no' | 'running'
  verdicts: Verdict[]
  myScore: number
  fitPoints: FitPoint[]
  outline: Outline
  reasonType?: 'match' | 'condition' | 'friction'
  reasonText?: string
  initiated: 'auto' | 'manual'
  startedAt: number
}

/** Agent 工作日志（02 §4） */
export type AgentRole = 'social' | 'twin' | 'judge' | 'privacy' | 'friend'

export interface AgentLog {
  id: string
  at: number
  role: AgentRole
  text: string
  reason: string
}

export interface Notification {
  id: string
  title: string
  body: string
  at: number
  /** 點通知要去的頁面（例如 /tasks/<id>）；沒有就只是關掉 */
  link?: string
  /** 幾毫秒後自動消失；沒有就一直留著到用戶點掉 */
  ttlMs?: number
}

/** 大厅候选人卡片（02 §F4） */
export interface Candidate {
  id: string
  name: string
  intro: string
  interests: string[]
  chatStyle: string
  mbti: string
  status: 'online' | 'proxying'
  fitPredict: number
}

// ── Api 介面（画面只透过这层拿资料） ──

export interface Api {
  login(email: string, password: string): Promise<User>
  getMemories(): Promise<Memory[]>
  deleteMemory(id: string): Promise<void>
  getProfile(): Promise<ShareableProfile>
  updateProfile(p: Partial<ShareableProfile>): Promise<ShareableProfile>
  getLobby(): Promise<Candidate[]>
  askLobbyHelper(q: string): Promise<string>
}
