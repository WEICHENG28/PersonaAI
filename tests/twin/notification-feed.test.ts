import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startNotificationFeed } from '../../src/features/twin/components/notificationFeed'

function harness() {
  let change!: () => void
  let failed!: () => void
  const reload = vi.fn()
  const onFailed = vi.fn()
  const unsubscribe = vi.fn()
  const subscribe = vi.fn((next: () => void, down: () => void) => {
    change = next; failed = down
    return unsubscribe
  })
  const stop = startNotificationFeed({ reload, subscribe, onFailed })
  return { reload, onFailed, unsubscribe, change: () => change(), failed: () => failed(), stop }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('notification initial read and realtime lifecycle', () => {
  it('reads once for initial subscription readiness, then refreshes on later events', () => {
    const h = harness()
    expect(h.reload).not.toHaveBeenCalled()
    h.change() // subscribeNotifications 的首个 system status ok
    vi.advanceTimersByTime(3000)
    expect(h.reload).toHaveBeenCalledOnce()
    h.change() // 后续数据事件／重连
    expect(h.reload).toHaveBeenCalledTimes(2)
    h.stop()
  })

  it('reads immediately on initial connection failure and enables the existing polling fallback', () => {
    const h = harness()
    h.failed(); h.failed()
    vi.advanceTimersByTime(3000)
    expect(h.reload).toHaveBeenCalledOnce()
    expect(h.onFailed).toHaveBeenCalledTimes(2)
    h.stop()
  })

  it('falls back to one read if realtime has not responded within two seconds', () => {
    const h = harness()
    vi.advanceTimersByTime(1999)
    expect(h.reload).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(h.reload).toHaveBeenCalledOnce()
    h.change() // 迟到的连接事件用于补齐空窗期
    expect(h.reload).toHaveBeenCalledTimes(2)
    h.stop()
  })

  it('cancels timers, unsubscribes and ignores late callbacks on cleanup', () => {
    const h = harness()
    h.stop()
    h.change(); h.failed()
    vi.advanceTimersByTime(3000)
    expect(h.unsubscribe).toHaveBeenCalledOnce()
    expect(h.reload).not.toHaveBeenCalled()
    expect(h.onFailed).not.toHaveBeenCalled()
  })

  it('does not duplicate the initial read during an effect cleanup/setup replay', () => {
    const first = harness()
    first.stop()
    const second = harness()
    first.change(); second.change()
    vi.advanceTimersByTime(3000)
    expect(first.reload).not.toHaveBeenCalled()
    expect(second.reload).toHaveBeenCalledOnce()
    second.stop()
  })
})
