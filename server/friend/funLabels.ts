/**
 * A9：娛樂性格話題。擁有者：A。P2 功能。
 * POST /api/profile/fun → Prompt 12 → 存入 user_profiles.fun_labels。
 */
import { z } from 'zod'
import { getServiceClient } from '../lib/supabase'
import { llmJson } from '../lib/llm'
import { writeLog } from '../lib/log'
import { renderFunSystem, funLabelSchema } from '../prompts/12_fun'
import type { ShareableProfile } from '../../shared/types'

export class FunLabelsError extends Error {
  constructor(message = '娱乐标签生成失败') {
    super(message)
    this.name = 'FunLabelsError'
  }
}

export interface FunLabelsRow {
  mbti_guess: string
  reason: string
  report: string
  user_mbti: string | null   // 用户自填
  updated_at: string
}

/**
 * 讀取目前 fun_labels（可能為 null）。
 */
export async function getFunLabels(userId: string): Promise<FunLabelsRow | null> {
  const db = getServiceClient()
  const { data } = await db
    .from('user_profiles')
    .select('fun_labels, updated_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (!data?.fun_labels) return null
  const fl = data.fun_labels as Record<string, unknown>
  return {
    mbti_guess: (fl.mbti_guess as string) ?? '',
    reason: (fl.reason as string) ?? '',
    report: (fl.report as string) ?? '',
    user_mbti: (fl.user_mbti as string | null) ?? null,
    updated_at: data.updated_at as string,
  }
}

/**
 * 呼叫 Prompt 12（MODEL_FAST，temperature 0.9），存入 fun_labels。
 * 需要 shareable_profile 存在，否則拋 FunLabelsError。
 */
export async function generateFunLabels(userId: string): Promise<FunLabelsRow> {
  const db = getServiceClient()

  // 取 shareable_profile
  const { data: profileRow } = await db
    .from('user_profiles')
    .select('shareable_profile, fun_labels')
    .eq('user_id', userId)
    .maybeSingle()

  const shareable = profileRow?.shareable_profile as ShareableProfile | null
  if (!shareable) throw new FunLabelsError('请先完成对外档案，才能生成娱乐标签')

  const shareableJson = JSON.stringify(shareable, null, 2)

  // 呼叫 Prompt 12
  const out = await llmJson({
    role: 'fast',
    system: renderFunSystem(shareableJson),
    messages: [{ role: 'user', content: '生成娱乐性格标签' }],
    temperature: 0.9,
    schema: funLabelSchema,
  })

  // 保留用户自填 mbti（若已有）
  const existingFl = profileRow?.fun_labels as Record<string, unknown> | null
  const userMbti = existingFl?.user_mbti ?? null

  const newFl = {
    mbti_guess: out.mbti_guess,
    reason: out.reason,
    report: out.report,
    user_mbti: userMbti,
  }

  const { error } = await db
    .from('user_profiles')
    .upsert({ user_id: userId, fun_labels: newFl, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
  if (error) throw new FunLabelsError(`保存娱乐标签失败：${error.message}`)

  await writeLog({
    user_id: userId,
    agent: 'friend',
    action: '生成娱乐标签',
    reason: `MBTI 猜测：${out.mbti_guess}`,
  })

  const now = new Date().toISOString()
  return {
    mbti_guess: out.mbti_guess,
    reason: out.reason,
    report: out.report,
    user_mbti: userMbti as string | null,
    updated_at: now,
  }
}

/** 用户自填 MBTI（不重新跑 LLM）。 */
export const userMbtiSchema = z.object({
  user_mbti: z.string().regex(/^[EI][NS][TF][JP]$/).nullable(),
})

export async function setUserMbti(userId: string, userMbti: string | null): Promise<FunLabelsRow> {
  const db = getServiceClient()

  const { data: profileRow } = await db
    .from('user_profiles')
    .select('fun_labels')
    .eq('user_id', userId)
    .maybeSingle()

  const existing = (profileRow?.fun_labels as Record<string, unknown> | null) ?? {}
  const updated = { ...existing, user_mbti: userMbti }

  const { error } = await db
    .from('user_profiles')
    .upsert({ user_id: userId, fun_labels: updated, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
  if (error) throw new FunLabelsError(`保存 MBTI 失败：${error.message}`)

  return {
    mbti_guess: (existing.mbti_guess as string) ?? '',
    reason: (existing.reason as string) ?? '',
    report: (existing.report as string) ?? '',
    user_mbti: userMbti,
    updated_at: new Date().toISOString(),
  }
}
