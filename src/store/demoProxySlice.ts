import type { StoreApi } from 'zustand'
import type { AgentTask, ChatMessage } from '@lib/api/types'
import { buildProxyTimeline, remainingSchedule, type ProxyEvent } from '@demo/proxyTimeline'
import { judgeVerdicts, otherTwinReplies, proxyScript, taskLogBeats } from '@demo/scenario'
import { suitableTarget } from '@demo/taskDraft'
import { clearTimers, later, uid } from './demoTimers'
import type { DemoActions, DemoState } from './demoTypes'

/**
 * Demo 代聊（UX #1、#2、#8）：照 proxyTimeline 的绝对排程套用事件。
 * startProxy 是幂等的；本人接手、关闭社交 Agent 会停掉排程，接回／重新开启时从进度接着跑。
 */

type Set = StoreApi<DemoState>['setState']
type Get = StoreApi<DemoState>['getState']

const TIMELINE = buildProxyTimeline()
/** 对方分身回本人的延迟：1.5～2.5 秒 */
const REPLY_MIN_MS = 1500
const REPLY_JITTER_MS = 1000

/** 排程是否正在跑（不存档：重新整理后由 resumeProxy 接着跑） */
let running = false

export function stopProxyTimers(): void {
  clearTimers('proxy')
  running = false
}

function taskSummary(task: AgentTask | null): string {
  if (!task) return '大厅里派分身和林小山聊聊'
  const who = task.condition === '不限' ? '' : `${task.condition}的`
  return `找 ${task.count} 个${who}人（目的：${task.goal}，完成条件：${task.doneWhen}）`
}

function logText(index: number, task: AgentTask | null): string {
  const beat = taskLogBeats[index]!
  if (index === 0) return `收到任务：${taskSummary(task)}`
  if (beat.anchor.kind === 'done' && task) {
    return `${beat.text}（进度 ${Math.min(task.progress + 1, suitableTarget(task.count))} / ${suitableTarget(task.count)}）`
  }
  return beat.text
}

function applyEvent(event: ProxyEvent, set: Set, get: Get): void {
  const s = get()
  const tick = { proxyTick: s.proxyTick + 1 }
  switch (event.kind) {
    case 'msg': {
      const beat = proxyScript[event.step]!
      set({ ...tick, proxyMessages: [...s.proxyMessages, { id: uid(), at: Date.now(), ...beat }], proxyStep: event.step + 1 })
      return
    }
    case 'verdict':
      set({ ...tick, verdicts: [...s.verdicts, judgeVerdicts[event.index]!] })
      return
    case 'log': {
      const beat = taskLogBeats[event.index]!
      const log = { id: uid(), at: Date.now(), role: beat.role, reason: beat.reason, text: logText(event.index, s.task) }
      set({ ...tick, taskLogs: [...s.taskLogs, log] })
      return
    }
    case 'done': {
      running = false
      const task = s.task ? finishOne(s.task) : null
      set({ ...tick, proxyDone: true, task })
      s.pushNotification({ title: '双向合适', body: '你和林小山聊得来，看看结果页或直接接手。', link: '/chat/lin/result' })
    }
  }
}

function finishOne(task: AgentTask): AgentTask {
  const progress = Math.min(task.progress + 1, suitableTarget(task.count))
  return { ...task, progress, dailyChats: task.dailyChats + 1, status: progress >= suitableTarget(task.count) ? 'done' : task.status }
}

function note(get: Get, text: string) {
  const s = get()
  return [...s.controlNotes, { id: uid(), afterCount: s.proxyMessages.length, text }]
}

type ProxyActions = Pick<DemoActions, 'startProxy' | 'resumeProxy' | 'takeOver' | 'handBack' | 'sendProxyMessage'>

export function createProxyActions(set: Set, get: Get): ProxyActions {
  const schedule = () => {
    const s = get()
    if (running || s.proxyDone || s.takenOver || s.task?.status === 'paused') return
    const rest = remainingSchedule(TIMELINE, s.proxyTick)
    if (rest.length === 0) return
    running = true
    rest.forEach(({ event, delay }) => later(delay, () => applyEvent(event, set, get), 'proxy'))
  }

  return {
    startProxy: schedule,
    // 重新整理或接回时：只有已经开始过才接着跑
    resumeProxy: () => {
      if (get().proxyTick > 0) schedule()
    },
    takeOver: () => {
      if (get().takenOver) return
      stopProxyTimers()
      // 分身还没开始聊（大厅「我自己聊」）：不显示「分身已停下」
      const text = get().proxyTick > 0 ? '你本人接手了，分身已停下' : '你以本人身份开始聊天'
      set({ takenOver: true, controlNotes: note(get, text) })
    },
    handBack: () => {
      if (!get().takenOver) return
      set({ takenOver: false, controlNotes: note(get, '分身已接回，接下来由分身继续聊') })
      get().resumeProxy()
    },
    sendProxyMessage: (text) => {
      const human: ChatMessage = { id: uid(), speaker: 'human', text, at: Date.now() }
      set((s) => ({ proxyMessages: [...s.proxyMessages, human] }))
      const replied = get().proxyMessages.filter((m) => m.speaker === 'other-twin' && m.round === undefined).length
      const reply = otherTwinReplies[replied % otherTwinReplies.length]!
      later(REPLY_MIN_MS + Math.random() * REPLY_JITTER_MS, () => {
        const msg: ChatMessage = { id: uid(), speaker: 'other-twin', text: reply, at: Date.now() }
        set((s) => ({ proxyMessages: [...s.proxyMessages, msg] }))
      })
    },
  }
}
