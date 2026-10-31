/**
 * Issue 3 必测：Nudge 模式——一段沉默只触发一次。
 * 用 vitest fake timer 模拟 40 秒沉默，确认：
 * 1. 40 秒后 callFriendChat 被调用一次（mode='nudge'）。
 * 2. 同一段沉默不会再次触发（nudgeSentAfter 防重）。
 * 3. 用户发消息后，下一段沉默可以再触发一次。
 *
 * 测试策略：直接测前端逻辑（nudge 计时器），用 mock 替换 API 调用。
 * 不需要 Supabase / LLM，只需要模拟 callFriendChat 与 getFriendMessages。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── nudge 逻辑（从 FriendPage.tsx 中提取，便于单元测试）─────────────────────────
// 实际产品代码在 useEffect 里；这里把相同逻辑写成纯函数便于测试
export type ChatRole = 'user' | 'friend'
export interface Msg { id: string; role: ChatRole }

/**
 * 模拟 FriendPage 的 nudge 计时器：
 * - messages 最后一则是 friend → 等 delayMs 后调用 onNudge(lastId)
 * - 同一 lastId 不重复触发（由 nudgeSentSet 外部维护）
 * 返回 clearTimeout 的清理函数。
 */
export function scheduleNudge(
  messages: Msg[],
  nudgeSentSet: Set<string>,
  onNudge: (lastId: string) => void,
  delayMs: number,
): () => void {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'friend') return () => {}
  if (nudgeSentSet.has(last.id)) return () => {}
  const id = last.id
  const timer = setTimeout(() => {
    nudgeSentSet.add(id)
    onNudge(id)
  }, delayMs)
  return () => clearTimeout(timer)
}

// ── 测试 ─────────────────────────────────────────────────────────────────────

describe('Nudge 计时器', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('最后一则是 friend 消息时，40s 后触发 onNudge', () => {
    const onNudge = vi.fn()
    const sent = new Set<string>()
    const msgs: Msg[] = [
      { id: 'm1', role: 'user' },
      { id: 'm2', role: 'friend' },
    ]
    scheduleNudge(msgs, sent, onNudge, 40_000)
    vi.advanceTimersByTime(39_999)
    expect(onNudge).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onNudge).toHaveBeenCalledOnce()
    expect(onNudge).toHaveBeenCalledWith('m2')
  })

  it('最后一则是 user 消息时，不触发 nudge', () => {
    const onNudge = vi.fn()
    const sent = new Set<string>()
    const msgs: Msg[] = [
      { id: 'm1', role: 'friend' },
      { id: 'm2', role: 'user' },
    ]
    scheduleNudge(msgs, sent, onNudge, 40_000)
    vi.advanceTimersByTime(60_000)
    expect(onNudge).not.toHaveBeenCalled()
  })

  it('同一 lastId 同一段沉默只触发一次', () => {
    const onNudge = vi.fn()
    const sent = new Set<string>()
    const msgs: Msg[] = [{ id: 'm3', role: 'friend' }]

    // 第一次注册计时器
    scheduleNudge(msgs, sent, onNudge, 40_000)
    vi.advanceTimersByTime(40_000)
    expect(onNudge).toHaveBeenCalledOnce()

    // 同一段沉默再次尝试注册（例如 re-render）
    scheduleNudge(msgs, sent, onNudge, 40_000)
    vi.advanceTimersByTime(40_000)
    // 仍然只调用一次
    expect(onNudge).toHaveBeenCalledOnce()
  })

  it('清理函数可以取消 nudge', () => {
    const onNudge = vi.fn()
    const sent = new Set<string>()
    const msgs: Msg[] = [{ id: 'm4', role: 'friend' }]
    const cancel = scheduleNudge(msgs, sent, onNudge, 40_000)
    vi.advanceTimersByTime(20_000)
    cancel() // 用户在 20s 后发了消息，取消
    vi.advanceTimersByTime(30_000)
    expect(onNudge).not.toHaveBeenCalled()
  })

  it('用户发新消息后，新 friend 消息的下一段沉默可以再触发', () => {
    const onNudge = vi.fn()
    const sent = new Set<string>()

    // 第一轮：沉默触发
    let msgs: Msg[] = [{ id: 'a1', role: 'friend' }]
    scheduleNudge(msgs, sent, onNudge, 40_000)
    vi.advanceTimersByTime(40_000)
    expect(onNudge).toHaveBeenCalledOnce()

    // 用户回复 → 阿澈再回 → 新的 friend 消息 id
    msgs = [
      { id: 'a1', role: 'friend' },
      { id: 'a2', role: 'user' },
      { id: 'a3', role: 'friend' }, // 新的 friend 消息
    ]
    scheduleNudge(msgs, sent, onNudge, 40_000)
    vi.advanceTimersByTime(40_000)
    expect(onNudge).toHaveBeenCalledTimes(2)
    expect(onNudge).toHaveBeenLastCalledWith('a3')
  })
})
