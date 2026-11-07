/**
 * A3：記憶擷取與「它記得的事」。擁有者：A。
 * extractMemories：Prompt 2（MODEL_FAST）→ 去重 → 寫 user_memory。
 * API：GET /api/memory（未刪除）、DELETE /api/memory/[id]（設 deleted_at）。
 */
import { z } from 'zod'
import { conditionKeyword, isNegated } from '../../shared/negation.js'
import { getServiceClient } from '../lib/supabase.js'
import { llmJson } from '../lib/llm/index.js'
import { CONFIG } from '../lib/config.js'
import { writeLog } from '../lib/log.js'
import { extractedMemoriesSchema, memoryPromptUser, renderMemorySystem, type ExtractedMemories } from '../prompts/02_memory.js'

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
 * 正反相同時，內容相同或互相包含（≥ 2 字才有包含意義）視為重複。
 */
export function isDuplicateMemory(newContent: string, existing: readonly string[]): boolean {
  const n = newContent.trim()
  if (!n) return true
  return existing.some((e) => {
    const t = e.trim()
    if (!t) return false
    if (isNegated(n) !== isNegated(t)) return false
    if (n === t) return true
    // 短内容互相包含才算重复（单字包含无意义）
    if (n.length >= 2 && t.length >= 2) return n.includes(t) || t.includes(n)
    return false
  })
}

/** 主題與正反使用同一首子句，避免其他子句的否定造成誤刪。 */
function memoryTopic(content: string): { key: string; negated: boolean } {
  const clause = (content.trim().replace(/^用户/, '').split(/[，,。；;、]/, 1)[0] ?? '').replace(/[\p{P}\s]/gu, '')
  const text = clause.replace(/^(?:(?:最近|开始|一直|现在|其实|真的|还是|也|都|本来)\s*)+/, '')
  const topic = conditionKeyword(text)
  return { ...topic, key: topic.key.replace(/[了的\s]+$/, '') }
}

/** 由 M-1 取首子句的完整主題；不使用 includes 判斷相反。 */
export function memoryTopicKey(content: string): string {
  return memoryTopic(content).key
}

export function findContradicted(newContent: string, existing: MemoryRow[]): MemoryRow[] {
  const topic = memoryTopic(newContent)
  if (!topic.key) return []
  return existing.filter(row => {
    if (row.deleted_at !== null) return false
    const old = memoryTopic(row.content)
    return old.negated !== topic.negated && old.key === topic.key
  })
}

/** 限定持有者、未刪除且內容未被並行編輯的舊列；只記錄確實移除的記憶。 */
async function removeContradicted(userId: string, old: MemoryRow): Promise<string | null> {
  const deletedAt = new Date().toISOString()
  const { data, error } = await getServiceClient().from('user_memory')
    .update({ deleted_at: deletedAt })
    .eq('id', old.id).eq('user_id', userId).eq('content', old.content).is('deleted_at', null)
    .select('id').maybeSingle()
  if (error) throw new MemoryError(`移除旧记忆失败：${error.message}`)
  if (!data) return null
  await writeLog({
    user_id: userId, agent: 'friend', action: '移除相反记忆',
    reason: `新记忆与旧记忆相反，旧记忆已移除：${old.content}`,
  })
  return deletedAt
}

/** 新增或後續刪除失敗時補償；只還原本輪仍未變更的刪除，不復活別人後續編輯的列。 */
async function restoreContradicted(userId: string, removed: { old: MemoryRow; deletedAt: string }[]): Promise<void> {
  for (const { old, deletedAt } of removed) {
    try {
      const { data, error } = await getServiceClient().from('user_memory')
        .update({ deleted_at: null }).eq('id', old.id).eq('user_id', userId)
        .eq('content', old.content).eq('deleted_at', deletedAt).select('id').maybeSingle()
      if (error) throw error
      if (data) await writeLog({
        user_id: userId, agent: 'friend', action: '恢复记忆', reason: `记忆更新失败，旧记忆已恢复：${old.content}`,
      })
    } catch (error) {
      console.error('[memory] 恢复旧记忆失败', error)
    }
  }
}

/** LLM 失敗不致命：記憶晚一輪再抽也行（07A 流程第 6 步背景執行）。 */
export class MemoryError extends Error {
  constructor(message = '记忆抽取失败，晚一点再试') {
    super(message)
    this.name = 'MemoryError'
  }
}

/**
 * 撷取后先软删相反旧记忆，再批次新增；失败会尝试还原本轮删除并抛错（非事务）。
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
    .order('created_at', { ascending: false })
    .limit(RECENT_WINDOW)
  const recent = [...(recentRows ?? [])]
    .reverse()
    .map((m: { role: string; content: string }) => `${m.role === 'user' ? '用户' : '阿澈'}：${m.content}`)
    .join('\n')

  const out = await llmJson({
    lane: 'bg',
    timeoutMs: CONFIG.LLM_BG_TIMEOUT_MS,
    maxAttempts: 2,
    role: 'fast',
    system: renderMemorySystem({ text: userText, recent, existing: existingText }),
    messages: [{ role: 'user', content: memoryPromptUser() }],
    temperature: 0,
    schema: extractedMemoriesSchema,
  })

  return persistMemories(userId, existing, out.memories)
}

/** 寫入階段獨立處理補償與最新資料去重，維持擷取函式精簡。 */
async function persistMemories(userId: string, existing: MemoryRow[], memories: ExtractedMemories['memories']): Promise<number> {
  if (memories.length === 0) return 0
  const db = getServiceClient()
  const removed: { old: MemoryRow; deletedAt: string }[] = []
  let fresh: typeof memories
  try {
    // 同方向的新记忆已经存在时，仍移除相反旧列；每条旧列只处理一次。
    const contradicted = new Map(memories.flatMap(m => findContradicted(m.content, existing)).map(row => [row.id, row]))
    for (const old of contradicted.values()) {
      const deletedAt = await removeContradicted(userId, old)
      if (deletedAt) removed.push({ old, deletedAt })
    }
    // LLM 等待期间用户可能已编辑／删除记忆，去重必须使用当前有效资料。
    const current = await listMemories(userId)
    fresh = memories.filter(m => !isDuplicateMemory(m.content, current.map(e => e.content)))
    if (fresh.length === 0) return 0
    const { error } = await db.from('user_memory').insert(
      fresh.map(m => ({ user_id: userId, content: m.content, source: 'user_stated', confidence: Math.min(Math.max(m.confidence, 0), 1) })),
    )
    if (error) throw new MemoryError(`写入记忆失败：${error.message}`)
  } catch (error) {
    await restoreContradicted(userId, removed)
    throw error
  }

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
    .from('user_memory')
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
