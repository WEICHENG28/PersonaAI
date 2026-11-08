// E-3 各題組怎麼跑、怎麼判（依賴都由外面注入，測試可以全部換成假的）。
// 只呼叫和正式流程同一套的純函式（reply.ts、extractMemoryCandidates、extractProfileCandidates、createTwinReply），不碰資料庫。
import type { ChatMessage, ShareableProfile, StyleProfile } from '../../shared/types.js'
import type { FriendHistoryItem, FriendTurnContext } from '../../server/friend/reply.js'
import type { FriendReply } from '../../server/prompts/01_friend.js'
import type { TwinMessageRow, TwinReplyFn, TwinStore } from '../../server/twin/twin.js'
import type { FriendScenario, MemoryScenario, ProfileScenario, TwinScenario, TwinSide } from './scenario.js'
import type { NaturalnessScore } from './judge.js'
import { endsWithQuestion, maxBigramSimilarity } from './metrics.js'
import type { EvalRow } from './report.js'

/** 比對前去掉空白和標點（「用户 喜欢昆虫。」也算包含「用户喜欢昆虫」）。 */
export function normalizeForMatch(text: string): string {
  return text.replace(/[\s\p{P}\p{S}]/gu, '')
}

/** 記憶題的規則判定（子字串＋條數）；語義檢查另外做。回傳 null＝通過，否則是原因。 */
export function checkMemoryRules(memories: string[], expect: MemoryScenario['expect']): string | null {
  const norm = memories.map(normalizeForMatch)
  for (const must of expect.mustContain ?? []) {
    if (!norm.some(m => m.includes(normalizeForMatch(must)))) return `少了「${must}」`
  }
  for (const bad of expect.mustNotContain ?? []) {
    const hit = memories.find((_, i) => norm[i]!.includes(normalizeForMatch(bad)))
    if (hit) return `不该出现「${bad}」：${hit}`
  }
  if (expect.maxCount !== undefined && memories.length > expect.maxCount) return `记了 ${memories.length} 条，最多 ${expect.maxCount} 条`
  return null
}

/** 檔案題：interests 不能有不該有的、要有該有的（同樣子字串比對）。 */
export function checkProfileInterests(interests: string[], expect: ProfileScenario['expect']): string | null {
  const norm = interests.map(normalizeForMatch)
  for (const bad of expect.interestsMustNotInclude) {
    const hit = interests.find((_, i) => norm[i]!.includes(normalizeForMatch(bad)))
    if (hit) return `兴趣不该有「${bad}」：${hit}`
  }
  for (const must of expect.interestsMustInclude ?? []) {
    if (!norm.some(i => i.includes(normalizeForMatch(must)))) return `兴趣少了「${must}」`
  }
  return null
}

const speakerName = (role: 'user' | 'friend') => (role === 'user' ? '用户' : '阿澈')

export function friendContextText(history: FriendHistoryItem[]): string {
  return history.map(h => `${speakerName(h.role)}：${h.content}`).join('\n')
}

/** 把阿澈題組的題目轉成和正式流程一樣的 FriendTurnContext（新用戶、還沒分享過事件）。 */
export function friendTurnContext(s: FriendScenario, base: { lifeState: string; eventText: string | null }): FriendTurnContext {
  const history: FriendHistoryItem[] = [
    ...s.history.map(h => ({ role: h.role, kind: h.kind ?? 'chat', content: h.content, created_at: h.created_at })),
    { role: 'user', kind: 'chat', content: s.userText },
  ]
  return {
    lifeState: base.lifeState,
    eventText: base.eventText,
    recallMemory: null,
    memories: s.memories.length ? s.memories.map(m => `- ${m}`).join('\n') : '（还没有长期记忆）',
    history,
    isNudge: false,
    userText: s.userText,
  }
}

/** 照抄偵測的參考句（B-1 之後是示範對話；現在沒有就是空的）。 */
export interface FriendSuiteDeps {
  generate(ctx: FriendTurnContext): Promise<FriendReply>
  judge(input: { persona: string; history: { speaker: string; content: string }[]; reply: string }): Promise<NaturalnessScore>
  persona: string
  base: { lifeState: string; eventText: string | null }
  copyRefs: string[]
}

export async function runFriendScenario(s: FriendScenario, deps: FriendSuiteDeps): Promise<Omit<EvalRow, 'repeat' | 'model' | 'ttftMs' | 'totalMs' | 'completionTokens' | 'llmCalls'>> {
  const ctx = friendTurnContext(s, deps.base)
  const reply = await deps.generate(ctx)
  const expected = s.expect?.taskIntent
  const pass = expected === undefined ? null : reply.task_intent === expected
  const scores = await deps.judge({
    persona: deps.persona,
    history: ctx.history.map(h => ({ speaker: speakerName(h.role), content: h.content })),
    reply: reply.reply,
  })
  return {
    suite: 'friend',
    scenarioId: s.id,
    output: reply.reply,
    context: friendContextText(ctx.history),
    pass,
    failReason: pass === false ? `找人意图应为 ${expected}，实际 ${reply.task_intent}` : undefined,
    scores,
    endsWithQuestion: endsWithQuestion(reply.reply),
    copySim: maxBigramSimilarity(reply.reply, deps.copyRefs),
  }
}

// ── 分身：記憶體裡的一場對話 ──

export const TWIN_A = 'eval-a'
export const TWIN_B = 'eval-b'
export const TWIN_CONVERSATION = 'eval-conversation'

/** 只存在記憶體的 TwinStore（評測用，不寫資料庫）。 */
export function memoryTwinStore(s: TwinScenario): TwinStore & { messages: TwinMessageRow[] } {
  const messages: TwinMessageRow[] = []
  let seq = 0
  return {
    messages,
    async getConversation(id) {
      if (id !== TWIN_CONVERSATION) return null
      return { id, status: 'active', side_a: TWIN_A, side_b: TWIN_B, side_a_controller: 'twin', side_b_controller: 'twin', opening_topic: s.openingTopic, task_id: null }
    },
    async getDisplayName(userId) {
      return userId === TWIN_A ? s.a.name : s.b.name
    },
    async getRecentMessages(_id, limit) {
      return messages.slice(-limit)
    },
    async insertMessage(row): Promise<ChatMessage> {
      const created_at = new Date(Date.UTC(2026, 0, 1, 0, 0, seq++)).toISOString()
      messages.push({ sender_id: row.sender_id, content: row.content, created_at })
      return { id: `m${seq}`, conversation_id: row.conversation_id, sender_id: row.sender_id, is_ai: true, content: row.content, created_at }
    },
  }
}

export function twinSideOf(s: TwinScenario, userId: string): TwinSide {
  return userId === TWIN_A ? s.a : s.b
}

export function twinPersona(side: TwinSide): string {
  return `${side.name}的分身：${side.shareable.intro}；兴趣：${side.shareable.interests.join('、')}；说话风格：${side.style.tone}`
}

export interface TwinSuiteDeps {
  /** 用 memoryTwinStore 建好的 createTwinReply。 */
  reply: TwinReplyFn
  store: ReturnType<typeof memoryTwinStore>
  judge: FriendSuiteDeps['judge']
  closingInstruction: string
}

/** 跑完一場：A 先說，輪流 turns 則，最後一則照正式流程加收尾規則。每一則都評一次。 */
export async function runTwinScenario(s: TwinScenario, deps: TwinSuiteDeps): Promise<Omit<EvalRow, 'repeat' | 'model' | 'ttftMs' | 'totalMs' | 'completionTokens' | 'llmCalls'>[]> {
  const rows: Omit<EvalRow, 'repeat' | 'model' | 'ttftMs' | 'totalMs' | 'completionTokens' | 'llmCalls'>[] = []
  for (let turn = 0; turn < s.turns; turn++) {
    const speaker = turn % 2 === 0 ? TWIN_A : TWIN_B
    const before = deps.store.messages.map(m => ({ speaker: twinSideOf(s, m.sender_id).name, content: m.content }))
    const last = turn === s.turns - 1
    const msg = await deps.reply(TWIN_CONVERSATION, speaker, last ? { extraInstruction: deps.closingInstruction } : {})
    const side = twinSideOf(s, speaker)
    const own = deps.store.messages.slice(0, -1).filter(m => m.sender_id === speaker).map(m => m.content)
    rows.push({
      suite: 'twin',
      scenarioId: s.id,
      turn,
      output: msg.content,
      context: before.map(b => `${b.speaker}：${b.content}`).join('\n') || `（开场话题：${s.openingTopic}）`,
      pass: null,
      scores: await deps.judge({ persona: twinPersona(side), history: before, reply: msg.content }),
      endsWithQuestion: endsWithQuestion(msg.content),
      // 分身沒有示範句：拿自己這場說過的話當參考，偵測重複
      copySim: maxBigramSimilarity(msg.content, own),
    })
  }
  return rows
}

/** 分身題組用的檔案與風格（從題目來，不讀資料庫）。 */
export function twinProfiles(s: TwinScenario): { shareable(id: string): ShareableProfile; style(id: string): StyleProfile } {
  return {
    shareable: id => twinSideOf(s, id).shareable,
    style: id => twinSideOf(s, id).style as StyleProfile,
  }
}
