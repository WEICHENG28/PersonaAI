import type {
  AgentLog,
  AgentTask,
  ChatMessage,
  Memory,
  Notification,
  ShareableProfile,
  Verdict,
} from '@lib/api/types'
import type { TaskDraft } from '@demo/taskDraft'
import { failedMatch } from '@demo/scenario'
import { EMPTY_PROFILE } from '@demo/profileDraft'

/** Demo 通知：多带一个点下去要去的页面（吐司和阿澈红点共用同一份未读） */
export interface DemoNotification extends Notification {
  link?: string
}

/** 聊天室里的系统提示（「你本人接手了」「分身已接回」），插在第 afterCount 则讯息之后 */
export interface ControlNote {
  id: string
  afterCount: number
  text: string
}

export interface DemoSettings {
  devMode: boolean
  socialAgent: boolean
  gear: 'one-way' | 'mutual'
  proactive: 'off' | 'low' | 'normal'
  avgManualMin: number
}

/** 会存进 localStorage 的资料（mock 模式，UX #6） */
export interface DemoData {
  user: { id: string; email: string; nickname: string } | null
  // 朋友线
  friendMessages: ChatMessage[]
  memories: Memory[]
  userReplyCount: number
  usedBeatIds: Set<string>
  reportReady: boolean
  /** 看过阿澈的回报（看过就不再出现「模拟下次见面」） */
  reportSeen: boolean
  // 任务线
  task: AgentTask | null
  // 代聊线
  proxyMessages: ChatMessage[]
  /** 已出现的剧本讯息数 */
  proxyStep: number
  /** 已套用的时间轴事件数（重新整理后从这里接着跑） */
  proxyTick: number
  proxyDone: boolean
  taskLogs: AgentLog[]
  /** 已经公布的判定（跟着讯息进度出现） */
  verdicts: Verdict[]
  takenOver: boolean
  controlNotes: ControlNote[]
  // 本人聊天（大厅「我自己聊」、历史「本人去聊」），key 是对方名字
  humanChats: Record<string, ChatMessage[]>
  /** 已「直接请求真人」的对象名字 */
  humanRequested: string[]
  // 档案
  profile: ShareableProfile
  profileDraftReady: boolean
  /** 用户自己改过档案：之后不再用记忆覆盖 */
  profileEdited: boolean
  // 通知、设置
  notifications: DemoNotification[]
  settings: DemoSettings
}

export interface DemoActions {
  /** id 可选：http 模式传 auth user id，mock 默认 u-demo */
  login: (email: string, nickname: string, id?: string) => void
  logout: () => void

  friendIntro: () => void
  sendFriendMessage: (text: string) => void
  nextMeet: () => void
  dismissReport: () => void
  deleteMemory: (id: string) => void
  restoreMemory: (memory: Memory, index: number) => void

  createTask: (draft: TaskDraft) => void
  cancelTask: () => void
  setSocialAgent: (on: boolean) => void

  startProxy: () => void
  resumeProxy: () => void
  takeOver: () => void
  handBack: () => void
  sendProxyMessage: (text: string) => void

  sendHumanChat: (name: string, text: string) => void
  markHumanRequested: (name: string) => void

  confirmProfile: () => void
  updateProfile: (p: Partial<ShareableProfile>) => void

  pushNotification: (n: Omit<DemoNotification, 'id' | 'at'>) => void
  dismissNotification: (id: string) => void
  clearNotifications: () => void

  toggleSetting: (k: 'devMode') => void
  setSetting: <K extends keyof DemoSettings>(k: K, v: DemoSettings[K]) => void
}

export interface DemoState extends DemoData, DemoActions {
  /** 阿澈输入中（不存档） */
  friendTyping: boolean
  /** 历史页的不合适案例（静态） */
  failedMatch: typeof failedMatch
}

export const DEFAULT_SETTINGS: DemoSettings = {
  devMode: false,
  socialAgent: false,
  gear: 'mutual',
  proactive: 'normal',
  avgManualMin: 20,
}

export function initialData(): DemoData {
  return {
    user: null,
    friendMessages: [],
    memories: [],
    userReplyCount: 0,
    usedBeatIds: new Set<string>(),
    reportReady: false,
    reportSeen: false,
    task: null,
    proxyMessages: [],
    proxyStep: 0,
    proxyTick: 0,
    proxyDone: false,
    taskLogs: [],
    verdicts: [],
    takenOver: false,
    controlNotes: [],
    humanChats: {},
    humanRequested: [],
    profile: { ...EMPTY_PROFILE },
    profileDraftReady: false,
    profileEdited: false,
    notifications: [],
    settings: { ...DEFAULT_SETTINGS },
  }
}
