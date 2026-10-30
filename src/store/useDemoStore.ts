import { create } from 'zustand'
import type {
  AgentLog,
  AgentTask,
  ChatMessage,
  Memory,
  Notification,
  ShareableProfile,
} from '@lib/api/types'
import {
  friendScript,
  proxyScript,
  judgeVerdicts,
  fitPoints,
  outline,
  taskLogBeats,
  handoffSuggest,
  failedMatch,
  type FriendBeat,
} from '@demo/scenario'

/**
 * Demo 引擎：单一 store 管全部 demo 状态。
 * 用 setTimeout 一步步推进 scenario，画面即时反映。
 */

interface DemoState {
  // ── 用户 ──
  user: { id: string; email: string; nickname: string } | null
  /** id 可选：http 模式传 auth user id，mock 预设 u-demo */
  login: (email: string, nickname: string, id?: string) => void
  logout: () => void

  // ── 朋友线 ──
  friendMessages: ChatMessage[]
  friendTyping: boolean
  memories: Memory[]
  userReplyCount: number
  usedBeatIds: Set<string>
  nextMeetAvailable: boolean
  reportReady: boolean
  sendFriendMessage: (text: string) => void
  nextMeet: () => void
  dismissReport: () => void
  deleteMemory: (id: string) => void

  // ── 任务线 ──
  task: AgentTask | null
  createTask: (t: Omit<AgentTask, 'id' | 'status' | 'progress' | 'dailyChats'>) => void
  cancelTask: () => void

  // ── 代聊线 ──
  proxyMessages: ChatMessage[]
  proxyStep: number
  proxyDone: boolean
  taskLogs: AgentLog[]
  logStep: number
  startProxy: () => void
  takeOver: () => void
  takenOver: boolean
  sendProxyMessage: (text: string) => void
  handoffSuggest: string[]

  // ── 结果页 ──
  verdicts: typeof judgeVerdicts
  fitPoints: typeof fitPoints
  outline: typeof outline
  failedMatch: typeof failedMatch,

  // ── 档案 ──
  profile: ShareableProfile,
  profileDraftReady: boolean,
  confirmProfile: () => void
  updateProfile: (p: Partial<ShareableProfile>) => void

  // ── 通知 ──
  notifications: Notification[]
  pushNotification: (n: Omit<Notification, 'id' | 'at'>) => void
  dismissNotification: (id: string) => void

  // ── 设置 ──
  settings: {
    devMode: boolean
    socialAgent: boolean
    gear: 'one-way' | 'mutual'
    proactive: 'off' | 'low' | 'normal'
    avgManualMin: number
  }
  toggleSetting: (k: keyof DemoState['settings']) => void
  setSetting: <K extends keyof DemoState['settings']>(k: K, v: DemoState['settings'][K]) => void
}

let seq = 0
const uid = () => `x${++seq}`

/** 统一的排程器（测试时可 mock） */
const timers: ReturnType<typeof setTimeout>[] = []
function later(ms: number, fn: () => void) {
  const id = setTimeout(() => {
    fn()
    const i = timers.indexOf(id)
    if (i >= 0) timers.splice(i, 1)
  }, ms)
  timers.push(id)
}
export function clearTimers() {
  timers.forEach(clearTimeout)
  timers.length = 0
}

/** 阿澈回复脚本挑下一 beat */
function pickFriendBeat(state: DemoState, userText: string): FriendBeat | null {
  const remaining = friendScript.filter((b) => !state.usedBeatIds.has(beatId(b)))
  // 1. keyword 优先
  const kw = remaining.find(
    (b) => b.when === 'keyword' && b.keywords?.some((k) => userText.includes(k)),
  )
  if (kw) return kw
  // 2. after-n
  const after = remaining.find((b) => b.when === 'after-n' && (b.afterN ?? 0) <= state.userReplyCount)
  if (after) return after
  // 3. 兜底 reply（循环用）
  const replies = remaining.filter((b) => b.when === 'reply')
  if (replies.length > 0) return replies[state.userReplyCount % replies.length] ?? null
  return null
}

function beatId(b: FriendBeat) {
  return `${b.when}:${b.speaker}:${b.text.slice(0, 12)}`
}

export const useDemoStore = create<DemoState>((set, get) => ({
  user: null,
  login: (email, nickname, id = 'u-demo') => set({ user: { id, email, nickname } }),
  logout: () => {
    clearTimers()
    set(initialSlice())
  },

  friendMessages: [],
  friendTyping: false,
  memories: [],
  userReplyCount: 0,
  usedBeatIds: new Set<string>(),
  nextMeetAvailable: false,
  reportReady: false,
  sendFriendMessage: (text) => {
    const state = get()
    // 用户讯息
    set({
      friendMessages: [...state.friendMessages, { id: uid(), speaker: 'human', text, at: Date.now() }],
      userReplyCount: state.userReplyCount + 1,
    })

    // 阿澈打字中…
    set({ friendTyping: true })
    const beat = pickFriendBeat(get(), text)

    later(900, () => {
      const s = get()
      if (!beat) {
        set({ friendTyping: false })
        return
      }
      const messages = [...s.friendMessages, { id: uid(), speaker: 'friend' as const, text: beat.text, at: Date.now() }]
      const usedBeatIds = new Set(s.usedBeatIds).add(beatId(beat))
      const memories = beat.memory
        ? [...s.memories, { id: uid(), source: '用户主动提及', createdAt: Date.now(), ...beat.memory }]
        : s.memories
      set({
        friendMessages: messages,
        usedBeatIds,
        memories,
        friendTyping: false,
        // 聊满 3 轮：档案草稿就绪
        profileDraftReady: s.memories.length >= 1 || s.userReplyCount >= 3,
        // 聊满 5 轮：可以交任务（解锁「模拟下次见面」）
        nextMeetAvailable: s.userReplyCount + 1 >= 5,
      })
    })
  },
  nextMeet: () => {
    // 模拟时间经过：阿澈带新近况 + 社交 Agent 回报（02 §F1 表）
    const s = get()
    set({ friendTyping: true })
    later(800, () => {
      set({
        friendMessages: [
          ...s.friendMessages,
          {
            id: uid(),
            speaker: 'friend',
            text: '上次我最後还是去了展，逛得比想像中久。你週末的漫展怎么样？',
            at: Date.now(),
          },
        ],
        friendTyping: false,
      })
    })
    later(2200, () => {
      set({
        friendMessages: [
          ...get().friendMessages,
          {
            id: uid(),
            speaker: 'friend',
            text: '对了，你不在的时候我帮你看了一下，有两个人你可能想聊…要不要看看？',
            at: Date.now(),
          },
        ],
        reportReady: true,
      })
      get().pushNotification({
        title: '阿澈有事想跟你说',
        body: '你不在的时候，社交 Agent 帮你聊了几个人，有结果了。',
      })
    })
  },
  dismissReport: () => set({ reportReady: false }),
  deleteMemory: (id) => set((s) => ({ memories: s.memories.filter((m) => m.id !== id) })),

  task: null,
  createTask: (t) => {
    set({
      task: { ...t, id: 'task-1', status: 'running', progress: 0, dailyChats: 0 },
      settings: { ...get().settings, socialAgent: true },
    })
  },
  cancelTask: () => set({ task: null }),

  proxyMessages: [],
  proxyStep: 0,
  proxyDone: false,
  taskLogs: [],
  logStep: 0,
  takenOver: false,
  handoffSuggest,
  startProxy: () => {
    // 日志逐笔流入（dev_mode 面板）
    const runLog = (i: number) => {
      if (i >= taskLogBeats.length) return
      const beat = taskLogBeats[i]!
      later(500 + i * 650, () => {
        const s = get()
        set({
          taskLogs: [...s.taskLogs, { id: uid(), at: Date.now(), ...beat }],
          logStep: i + 1,
        })
        // 「开始代聊」日志出现后，启动讯息流
        if (i === 3) runMessages(0)
        // 双向合適日志出现后：通知 + 任务进度
        if (i === 9) {
          set({ proxyDone: true, task: get().task ? { ...get().task!, progress: 1 } : null })
          get().pushNotification({
            title: '双向合适',
            body: '你和林小山聊得来，看看结果页或直接接手。',
          })
        }
        runLog(i + 1)
      })
    }
    runLog(0)

    // 分身讯息流（比日志慢半拍，制造「直播」感）
    const runMessages = (step: number) => {
      if (step >= proxyScript.length) return
      const beat = proxyScript[step]!
      later(400 + step * 1100, () => {
        set({
          proxyMessages: [...get().proxyMessages, { id: uid(), at: Date.now(), ...beat }],
          proxyStep: step + 1,
        })
        runMessages(step + 1)
      })
    }
  },
  takeOver: () => set({ takenOver: true }),
  sendProxyMessage: (text) =>
    set((s) => ({
      proxyMessages: [...s.proxyMessages, { id: uid(), speaker: 'human', text, at: Date.now() }],
    })),

  verdicts: judgeVerdicts,
  fitPoints,
  outline,
  failedMatch,

  profile: {
    intro: '周末会去漫展的二次元，也在慢慢开始爬山。',
    interests: ['动漫', '漫展', '看展', '登山（新手）'],
    chatStyle: '慢热但真诚，喜欢先听再说',
    mbti: 'INFP',
    confirmed: false,
  },
  profileDraftReady: false,
  confirmProfile: () => set((s) => ({ profile: { ...s.profile, confirmed: true } })),
  updateProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),

  notifications: [],
  pushNotification: (n) =>
    set((s) => ({ notifications: [...s.notifications, { ...n, id: uid(), at: Date.now() }] })),
  dismissNotification: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),

  settings: {
    devMode: false,
    socialAgent: false,
    gear: 'mutual',
    proactive: 'normal',
    avgManualMin: 20,
  },
  toggleSetting: (k) =>
    set((s) => ({ settings: { ...s.settings, [k]: !s.settings[k] } as DemoState['settings'] })),
  setSetting: (k, v) => set((s) => ({ settings: { ...s.settings, [k]: v } })),
}))

function initialSlice() {
  return {
    user: null,
    friendMessages: [],
    friendTyping: false,
    memories: [],
    userReplyCount: 0,
    usedBeatIds: new Set<string>(),
    nextMeetAvailable: false,
    reportReady: false,
    task: null,
    proxyMessages: [],
    proxyStep: 0,
    proxyDone: false,
    taskLogs: [],
    logStep: 0,
    takenOver: false,
    notifications: [],
    profileDraftReady: false,
    profile: {
      intro: '周末会去漫展的二次元，也在慢慢开始爬山。',
      interests: ['动漫', '漫展', '看展', '登山（新手）'],
      chatStyle: '慢热但真诚，喜欢先听再说',
      mbti: 'INFP',
      confirmed: false,
    },
    settings: {
      devMode: false,
      socialAgent: false,
      gear: 'mutual' as const,
      proactive: 'normal' as const,
      avgManualMin: 20,
    },
  }
}
