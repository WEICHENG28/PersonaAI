/**
 * A3：記憶擷取與「它記得的事」。擁有者：A。
 * extractMemories：Prompt 2（MODEL_FAST）→ 去重 → 寫 user_memory。
 * API：GET /api/memory（未刪除）、DELETE /api/memory/[id]（設 deleted_at）。
 */
import { z } from 'zod'
import { getServiceClient } from '../lib/supabase.js'
import { llmJson } from '../lib/llm/index.js'
import { CONFIG } from '../lib/config.js'
import { writeLog } from '../lib/log.js'
import { extractedMemoriesSchema, renderMemorySystem } from '../prompts/02_memory.js'

export interface MemoryRow {
  id: string
  content: string
  source: string
  confidence: number
  created_at: string
  deleted_at: string | null
}

const RECENT_WINDOW = 6

/**
 * 必測的去重函式：內容相同或互相包含（≥ 2 字才有包含意義）視為重複。
 */
export function isDuplicateMemory(newContent: string, existing: readonly string[]): boolean {
  const n = newContent.trim()
  if (!n) return true
  return existing.some((e) => {
    const t = e.trim()
    if (!t) return false
    if (n === t) return true
    // 短内容互相包含才算重复（单字包含无意义）
    if (n.length >= 2 && t.length >= 2) return n.includes(t) || t.includes(n)
    return false
  })
}

/** LLM 失敗不致命：記憶晚一輪再抽也行（07A 流程第 6 步背景執行）。 */
export class MemoryError extends Error {
  constructor(message = '记忆抽取失败，晚一点再试') {
    super(message)
    this.name = 'MemoryError'
  }
}

/**
 * 撷取并写入（幂等风格：失败就整批放弃，不写半套）。
 * 回传实际写入的条数。
 */
export async function extractMemories(userId: string, userText: string): Promise<number> {
  const db = getServiceClient()

  // 现有记忆（未删除）给去重 + prompt
  const existing = await listMemories(userId)
  const existingText = existing.length ? existing.map((m) => `- ${m.content}`).join('\n') : '（无）'

  // 最近 6 则对话
  const { data: recentRows } = await db
    .from('friend_messages')
    .select('role, content')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(200)
  const recent = (recentRows ?? [])
    .slice(-RECENT_WINDOW)
    .map((m: { role: string; content: string }) => `${m.role === 'user' ? '用户' : '阿澈'}：${m.content}`)
    .join('\n')

  const out = await llmJson({
    role: 'fast',
    system: renderMemorySystem({ text: userText, recent, existing: existingText }),
    messages: [{ role: 'user', content: userText }],
    temperature: 0,
    schema: extractedMemoriesSchema,
  })

  // 去重后写入
  const fresh = out.memories.filter(
    (m) => !isDuplicateMemory(m.content, existing.map((e) => e.content)),
  )
  if (fresh.length === 0) return 0

  const { error } = await db.from('user_memory').insert(
    fresh.map((m) => ({
      user_id: userId,
      content: m.content,
      source: 'user_stated',
      confidence: Math.min(Math.max(m.confidence, 0), 1),
    })),
  )
  if (error) throw new MemoryError(`写入记忆失败：${error.message}`)

  await writeLog({
    user_id: userId,
    agent: 'friend',
    action: '撷取记忆',
    reason: `新增 ${fresh.length} 条`,
  })
  return fresh.length
}

/** 列出未删除的记忆（新→旧）。 */
export async function listMemories(userId: string): Promise<MemoryRow[]> {
  const db = getServiceClient()
  const { data, error } = await db
    .from('user_memory')
    .select('id, content, source, confidence, created_at, deleted_at')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(CONFIG.MEMORY_LIMIT ?? 50)
  if (error) throw new MemoryError(`读取记忆失败：${error.message}`)
  return (data ?? []) as MemoryRow[]
}

/** 软删除：设 deleted_at；找不到/已删回 false。 */
export async function deleteMemory(userId: string, memoryId: string): Promise<boolean> {
  const db = getServiceClient()
  const { data, error } = await db
    .from('user_memory')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', memoryId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select('id')
    .single()
  if (error || !data) return false
  await writeLog({ user_id: userId, agent: 'friend', action: '删除记忆', reason: '用户要求' })
  return true
}

export const memoryIdSchema = z.string().uuid()

/** 「这不太像我」：等同删除＋写日志。 */
export async function markNotLikeMe(userId: string, memoryId: string): Promise<boolean> {
  const ok = await deleteMemory(userId, memoryId)
  if (ok) {
    await writeLog({ user_id: userId, agent: 'friend', action: '标记「这不太像我」', reason: '等同删除，用户觉得不像自己' })
  }
  return ok
}

/** A8：编辑记忆内容（PATCH /api/memory/:id）。
 *  编辑后 source 改为 user_edited、confidence 固定 1。
 *  回传 false 表示找不到（已删除或不属于此用户）。
 */
export async function editMemory(
  userId: string,
  memoryId: string,
  content: string,
): Promise<MemoryRow | false> {
  const db = getServiceClient()
  const trimmed = content.trim()
  if (!trimmed) return false

  const { data, error } = await db
    .from('friend_memories')
    .update({ content: trimmed, source: 'user_edited', confidence: 1 })
    .eq('id', memoryId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select('id, content, source, confidence, created_at, deleted_at')
    .single()
  if (error || !data) return false

  await writeLog({
    user_id: userId,
    agent: 'friend',
    action: '编辑记忆',
    reason: `用户修改：${trimmed.slice(0, 40)}`,
  })
  return data as MemoryRow
}

export const memoryContentSchema = z.string().min(1).max(200)
