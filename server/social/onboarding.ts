/**
 * 新手引導（Peter 2026-11-06）：讓第一次來的人走完「聊天 → 檔案 → 進大廳 → 交辦任務 → 看結果」。
 * 進度全部從資料庫現有的紀錄算出來（不存額外狀態、不用 migration），所以中途離開下次回來會停在原來那一步。
 * 漏斗統計（管理員）也用同一套判斷。擁有者：B。
 */
import type { ShareableProfile } from '../../shared/types.js'
import { CONFIG } from '../lib/config.js'
import { assertAllowed } from '../lib/moderation.js'
import { getServiceClient } from '../lib/supabase.js'
import { isProfileComplete } from './lobbyInvite.js'

export const ONBOARDING_STEPS = ['chat', 'profile', 'lobby', 'task', 'result'] as const
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

export const STEP_LABEL: Record<OnboardingStep, string> = {
  chat: '和阿澈聊几句',
  profile: '生成你的档案',
  lobby: '进入大厅',
  task: '交办第一个找人任务',
  result: '看到第一份代聊结果',
}

export interface OnboardingState {
  userMessages: number
  shareable: ShareableProfile | null
  confirmed: boolean
  socialAgentEnabled: boolean
  /** 確認過（不是待確認、也沒取消）的任務 id，最新的在前。 */
  startedTaskIds: string[]
  /** 已經有判定結果的代聊（最新的）。 */
  firstResultConversationId: string | null
}

export interface OnboardingView {
  steps: { key: OnboardingStep; label: string; done: boolean }[]
  /** 下一步要做的（全部完成是 null）。 */
  current: OnboardingStep | null
  doneCount: number
  /** 第一步要說幾句。 */
  chatNeed: number
  userMessages: number
  shareable: ShareableProfile | null
  latestTaskId: string | null
  resultConversationId: string | null
}

export function stepDone(state: OnboardingState): Record<OnboardingStep, boolean> {
  const inLobby = state.confirmed && state.socialAgentEnabled
  const profile = isProfileComplete(state.shareable) || inLobby
  return {
    // 已經做完後面的步驟（例如用快速建檔），前面的聊天也算完成
    chat: state.userMessages >= CONFIG.ONBOARDING_CHAT_MESSAGES || profile,
    profile,
    lobby: inLobby,
    task: state.startedTaskIds.length > 0,
    result: Boolean(state.firstResultConversationId),
  }
}

export function onboardingView(state: OnboardingState): OnboardingView {
  const done = stepDone(state)
  const steps = ONBOARDING_STEPS.map((key) => ({ key, label: STEP_LABEL[key], done: done[key] }))
  return {
    steps,
    current: steps.find((s) => !s.done)?.key ?? null,
    doneCount: steps.filter((s) => s.done).length,
    chatNeed: CONFIG.ONBOARDING_CHAT_MESSAGES,
    userMessages: state.userMessages,
    shareable: state.shareable,
    latestTaskId: state.startedTaskIds[0] ?? null,
    resultConversationId: state.firstResultConversationId,
  }
}

export class OnboardingError extends Error {
  readonly status = 400
  constructor(message: string) {
    super(message)
    this.name = 'OnboardingError'
  }
}

export interface QuickProfileInput {
  intro: string
  interests: string[]
  looking_for: string
}

/** 快速建檔：三個問題直接生成對外檔案（不用先聊很多句）。只檢查內容，存檔交給 save。 */
export function normalizeQuickProfile(input: QuickProfileInput): { intro: string; interests: string[]; chat_style: string; looking_for: string } {
  const intro = input.intro.trim()
  const interests = [...new Set(input.interests.map((i) => i.trim()).filter(Boolean))].slice(0, 8)
  const looking_for = input.looking_for.trim()
  if (!intro) throw new OnboardingError('用一句话介绍一下自己吧')
  if (interests.length < 2) throw new OnboardingError('至少写 2 个兴趣，别人才找得到你')
  if (!looking_for) throw new OnboardingError('说说想认识什么样的人')
  assertAllowed(intro, looking_for, ...interests)
  return { intro, interests, chat_style: '轻松自然，喜欢真诚交流', looking_for }
}

/** 第一個任務的句子：用第一個興趣找 1 位，跑得快、馬上看到結果。 */
export function firstTaskText(shareable: ShareableProfile | null): string {
  const interest = shareable?.interests.find((i) => i.trim())
  return interest ? `帮我找 1 位也喜欢${interest}的朋友聊聊` : '帮我找 1 位聊得来的朋友聊聊'
}

/** 讀出某個用戶的引導狀態。 */
export async function loadOnboardingState(userId: string): Promise<OnboardingState> {
  const db = getServiceClient()
  const [count, user, profile, tasks, results] = await Promise.all([
    db.from('friend_messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('role', 'user'),
    db.from('users').select('social_agent_enabled').eq('id', userId).maybeSingle(),
    db.from('user_profiles').select('shareable_profile, shareable_confirmed').eq('user_id', userId).maybeSingle(),
    db.from('agent_tasks').select('id').eq('user_id', userId).not('status', 'in', '(pending_confirm,cancelled)').order('created_at', { ascending: false }).limit(5),
    db.from('match_attempts').select('conversation_id').eq('user_id', userId).neq('result', 'ongoing').order('created_at', { ascending: false }).limit(1),
  ])
  for (const r of [count, user, profile, tasks, results]) if (r.error) throw r.error
  return {
    userMessages: count.count ?? 0,
    shareable: (profile.data?.shareable_profile as ShareableProfile | null) ?? null,
    confirmed: Boolean(profile.data?.shareable_confirmed),
    socialAgentEnabled: Boolean(user.data?.social_agent_enabled),
    startedTaskIds: (tasks.data ?? []).map((t) => t.id as string),
    firstResultConversationId: (results.data?.[0]?.conversation_id as string | undefined) ?? null,
  }
}

export interface FunnelRow {
  step: OnboardingStep | 'signup'
  label: string
  users: number
  /** 佔註冊人數的比例（0–100）。 */
  percent: number
}

/** 漏斗：每一步有多少人走到（不含示範用戶）。 */
export function buildFunnel(states: OnboardingState[]): FunnelRow[] {
  const total = states.length
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0)
  const doneMaps = states.map(stepDone)
  return [
    { step: 'signup' as const, label: '进入网站（建立帐号）', users: total, percent: total ? 100 : 0 },
    ...ONBOARDING_STEPS.map((key) => {
      const n = doneMaps.filter((d) => d[key]).length
      return { step: key, label: STEP_LABEL[key], users: n, percent: pct(n) }
    }),
  ]
}
