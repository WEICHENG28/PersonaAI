import { create, type StoreApi } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type { ChatMessage, Memory } from '@lib/api/types'
import { failedMatch, friendIntro, nextMeetLine } from '@demo/scenario'
import { pickFriendReply } from '@demo/friendChat'
import { draftProfile } from '@demo/profileDraft'
import { later, clearTimers, uid } from './demoTimers'
import { createProxyActions, stopProxyTimers } from './demoProxySlice'
import { initialData, type DemoData, type DemoState } from './demoTypes'

export type { DemoNotification, ControlNote, DemoSettings } from './demoTypes'

/**
 * Demo 引擎：单一 store 管全部 demo 状态（mock 模式）。
 * 用排程一步步推进 scenario，画面即时反映；代聊时间轴在 demoProxySlice。
 * mock 模式会存进 localStorage（UX #6），重新整理不掉状态；http 模式不存档。
 */

const STORAGE_KEY = 'personaai-demo'
const isHttp = import.meta.env.VITE_API_MODE === 'http'

/** 档案草稿：聊满 3 句或有第一条记忆就生成 */
const DRAFT_AFTER_REPLIES = 3
const FRIEND_REPLY_MS = 900
const INTRO_GAP_MS = 1200

/** http 模式不存档：给 persist 一个什么都不做的 storage */
const noopStorage: StateStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

let introStarted = false

function friendMsg(text: string): ChatMessage {
  return { id: uid(), speaker: 'friend', text, at: Date.now() }
}

type SetState = StoreApi<DemoState>['setState']
type GetState = StoreApi<DemoState>['getState']

/** 阿澈回一句（900 毫秒后）；挑回复时 userReplyCount 已含这一句 */
function scheduleReply(set: SetState, get: GetState, text: string): void {
  const s = get()
  const recentTexts = s.friendMessages.filter((m) => m.speaker === 'friend').slice(-2).map((m) => m.text)
  const reply = pickFriendReply({ text, usedIds: [...s.usedBeatIds], userCount: s.userReplyCount, recentTexts })
  later(FRIEND_REPLY_MS, () => {
    const cur = get()
    const memories: Memory[] = reply.memory
      ? [...cur.memories, { id: uid(), source: '用户主动提及', createdAt: Date.now(), ...reply.memory }]
      : cur.memories
    const draftReady = memories.length >= 1 || cur.userReplyCount >= DRAFT_AFTER_REPLIES
    const keepProfile = cur.profileEdited || cur.profile.confirmed || !draftReady
    set({
      friendMessages: [...cur.friendMessages, friendMsg(reply.text)],
      usedBeatIds: reply.once ? new Set(cur.usedBeatIds).add(reply.id) : cur.usedBeatIds,
      memories,
      friendTyping: false,
      profileDraftReady: draftReady,
      profile: keepProfile ? cur.profile : draftProfile(memories),
    })
  })
}

export const useDemoStore = create<DemoState>()(
  persist(
    (set, get) => ({
      ...initialData(),
      friendTyping: false,
      failedMatch,

      login: (email, nickname, id = 'u-demo') => set({ user: { id, email, nickname } }),
      logout: () => {
        clearTimers()
        stopProxyTimers()
        introStarted = false
        set({ ...initialData(), friendTyping: false })
        useDemoStore.persist.clearStorage()
      },

      // ── 朋友线 ──
      // 进入朋友页时呼叫：开场白（重新整理时从没说完的地方接着说）；
      // 若最后一则是用户的话但阿澈还没回（回复途中重新整理），补回一句，不会沉默
      friendIntro: () => {
        if (introStarted) return
        introStarted = true
        const s = get()
        const last = s.friendMessages.at(-1)
        if (last?.speaker === 'human') {
          set({ friendTyping: true })
          scheduleReply(set, get, last.text)
          return
        }
        if (s.userReplyCount > 0) return
        const rest = friendIntro.slice(s.friendMessages.length)
        if (rest.length === 0) return
        set({ friendTyping: true })
        rest.forEach((text, i) => {
          later(700 + i * INTRO_GAP_MS, () => {
            set((cur) => ({ friendMessages: [...cur.friendMessages, friendMsg(text)], friendTyping: i < rest.length - 1 }))
          })
        })
      },
      sendFriendMessage: (text) => {
        const s = get()
        set({
          friendMessages: [...s.friendMessages, { id: uid(), speaker: 'human', text, at: Date.now() }],
          userReplyCount: s.userReplyCount + 1,
          friendTyping: true,
        })
        scheduleReply(set, get, text)
      },
      nextMeet: () => {
        // 模拟时间经过：阿澈带新近况 + 社交 Agent 回报（02 §F1 表）
        set({ friendTyping: true })
        later(800, () => set((s) => ({ friendMessages: [...s.friendMessages, friendMsg(nextMeetLine)], friendTyping: false })))
        later(2200, () => {
          set((s) => ({
            friendMessages: [...s.friendMessages, friendMsg('对了，你不在的时候我帮你看了一下，有人跟你挺合的…要不要看看？')],
            reportReady: true,
          }))
          get().pushNotification({ title: '阿澈有事想跟你说', body: '你不在的时候，社交 Agent 帮你聊了几个人，有结果了。', link: '/friend' })
        })
      },
      dismissReport: () => set({ reportReady: false, reportSeen: true }),
      deleteMemory: (id) => set((s) => ({ memories: s.memories.filter((m) => m.id !== id) })),
      restoreMemory: (memory, index) =>
        set((s) => {
          if (s.memories.some((m) => m.id === memory.id)) return {}
          const next = [...s.memories]
          next.splice(Math.min(index, next.length), 0, memory)
          return { memories: next }
        }),

      // ── 任务线 ──
      createTask: (draft) => {
        if (get().task) return
        // 代聊还没开始过：之前在大厅「我自己聊」留下的接手状态清掉，让这次任务的分身能开始
        if (get().proxyTick === 0) set({ takenOver: false, controlNotes: [] })
        set((s) => ({
          task: {
            id: 'task-1',
            goal: draft.goal,
            condition: draft.condition,
            count: draft.count,
            doneWhen: draft.doneWhen,
            status: 'running',
            progress: 0,
            dailyChats: 0,
          },
          settings: { ...s.settings, socialAgent: true },
        }))
      },
      cancelTask: () => {
        stopProxyTimers()
        const fresh = initialData()
        set({
          task: null,
          proxyMessages: fresh.proxyMessages,
          proxyStep: 0,
          proxyTick: 0,
          proxyDone: false,
          taskLogs: fresh.taskLogs,
          verdicts: fresh.verdicts,
          takenOver: false,
          controlNotes: fresh.controlNotes,
        })
      },
      setSocialAgent: (on) => {
        const s = get()
        const task = s.task && s.task.status !== 'done' ? { ...s.task, status: on ? ('running' as const) : ('paused' as const) } : s.task
        set({ settings: { ...s.settings, socialAgent: on }, task })
        if (on) get().resumeProxy()
        else stopProxyTimers()
      },

      // ── 代聊线 ──
      ...createProxyActions(set, get),

      // ── 本人聊天（大厅、历史重启） ──
      sendHumanChat: (name, text) => {
        const add = (m: ChatMessage) => set((s) => ({ humanChats: { ...s.humanChats, [name]: [...(s.humanChats[name] ?? []), m] } }))
        add({ id: uid(), speaker: 'human', text, at: Date.now() })
        later(1500 + Math.random() * 1000, () => {
          const count = (get().humanChats[name] ?? []).filter((m) => m.speaker === 'other-twin').length
          add({ id: uid(), speaker: 'other-twin', text: HUMAN_CHAT_REPLIES[count % HUMAN_CHAT_REPLIES.length]!, at: Date.now() })
        })
      },
      markHumanRequested: (name) =>
        set((s) => (s.humanRequested.includes(name) ? {} : { humanRequested: [...s.humanRequested, name] })),

      // ── 档案 ──
      confirmProfile: () => set((s) => ({ profile: { ...s.profile, confirmed: true } })),
      updateProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p }, profileEdited: true })),

      // ── 通知 ──
      pushNotification: (n) => set((s) => ({ notifications: [...s.notifications, { ...n, id: uid(), at: Date.now() }] })),
      dismissNotification: (id) => set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
      clearNotifications: () => set({ notifications: [] }),

      // ── 设置 ──
      toggleSetting: (k) => set((s) => ({ settings: { ...s.settings, [k]: !s.settings[k] } })),
      setSetting: (k, v) => set((s) => ({ settings: { ...s.settings, [k]: v } })),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => (isHttp ? noopStorage : localStorage)),
      partialize: (s): PersistedData => ({ ...pickData(s), usedBeatIds: [...s.usedBeatIds] }),
      merge: (persisted, current) => {
        const p = persisted as Partial<PersistedData> | undefined
        if (!p) return current
        return { ...current, ...p, usedBeatIds: new Set(p.usedBeatIds ?? []) }
      },
      // 重新整理时代聊跑到一半：从进度接着跑
      onRehydrateStorage: () => (state) => state?.resumeProxy(),
    },
  ),
)

/** 存档格式：Set 转成阵列 */
type PersistedData = Omit<DemoData, 'usedBeatIds'> & { usedBeatIds: string[] }

const DATA_KEYS = Object.keys(initialData()) as (keyof DemoData)[]

function pickData(s: DemoState): Omit<DemoData, 'usedBeatIds'> {
  const out: Record<string, unknown> = {}
  for (const k of DATA_KEYS) if (k !== 'usedBeatIds') out[k] = s[k]
  return out as Omit<DemoData, 'usedBeatIds'>
}

/** 本人去聊时，对方（分身代答）的回复 */
const HUMAN_CHAT_REPLIES = [
  '你好呀，没想到你会本人来聊！',
  '上次聊得有点急，这次我们慢慢说。',
  '嗯嗯，我在听，你说。',
  '这个想法挺好的，我之前没这样想过。',
  '哈哈，好呀，那就先从轻松的聊起。',
]
