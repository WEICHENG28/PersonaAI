import { afterEach, describe, expect, it } from 'vitest'
import { createWorkerPool } from '../../server/social/workerPool'
import { runInBackground } from '../../server/lib/background'

function deferred() {
  let resolve!: (v: string) => void
  const promise = new Promise<string>((r) => (resolve = r))
  return { promise, resolve }
}

describe('createWorkerPool', () => {
  it('同時推進多個任務，但不超過上限', async () => {
    const gates = new Map<string, ReturnType<typeof deferred>>()
    const pool = createWorkerPool({
      listRunning: async () => ['a', 'b', 'c', 'd'],
      runStep: (id) => {
        const g = deferred()
        gates.set(id, g)
        return g.promise
      },
      concurrency: 3,
    })
    expect(await pool.tick()).toBe(3)
    expect([...gates.keys()]).toEqual(['a', 'b', 'c'])
    expect(pool.running).toBe(3)

    // 滿了就不再開
    expect(await pool.tick()).toBe(0)

    // a 跑完讓出位置：下一輪先輪到還沒跑過的 d，不是 a 又插隊
    gates.get('a')!.resolve('ok')
    await new Promise((r) => setTimeout(r, 0))
    expect(await pool.tick()).toBe(1)
    expect(gates.has('d')).toBe(true)
    expect(pool.running).toBe(3)

    // 再空出一個位置（b）：最久沒跑的是 a，輪到 a
    const before = gates.get('a')
    gates.get('b')!.resolve('ok')
    await new Promise((r) => setTimeout(r, 0))
    expect(await pool.tick()).toBe(1)
    expect(gates.get('a')).not.toBe(before)
    for (const g of gates.values()) g.resolve('ok')
    await pool.drain()
    expect(pool.running).toBe(0)
  })

  it('同一任務上一步還沒跑完就不重疊', async () => {
    const g = deferred()
    let calls = 0
    const pool = createWorkerPool({
      listRunning: async () => ['a'],
      runStep: () => {
        calls++
        return g.promise
      },
      concurrency: 5,
    })
    await pool.tick()
    await pool.tick()
    expect(calls).toBe(1)
    g.resolve('ok')
    await pool.drain()
  })

  it('一個任務失敗不影響其他任務，也會讓出位置', async () => {
    const errors: string[] = []
    const logs: string[] = []
    const pool = createWorkerPool({
      listRunning: async () => ['bad', 'good'],
      runStep: async (id) => {
        if (id === 'bad') throw new Error('boom')
        return 'stepped'
      },
      concurrency: 2,
      log: (id, o) => logs.push(`${id}:${o}`),
      onError: (id) => errors.push(id),
    })
    await pool.tick()
    await pool.drain()
    expect(errors).toEqual(['bad'])
    expect(logs).toEqual(['good:stepped'])
    expect(pool.running).toBe(0)
  })
})

describe('runInBackground', () => {
  const key = Symbol.for('@vercel/request-context')
  afterEach(() => {
    delete (globalThis as Record<symbol, unknown>)[key]
  })

  it('在 Vercel 上交給 waitUntil，回覆送出後也會等它做完', async () => {
    const waited: Promise<unknown>[] = []
    ;(globalThis as Record<symbol, unknown>)[key] = { get: () => ({ waitUntil: (p: Promise<unknown>) => waited.push(p) }) }
    runInBackground(Promise.resolve('done'))
    expect(waited).toHaveLength(1)
  })

  it('本機沒有 Vercel context 也不會出錯；失敗的工作不會變成 unhandled', async () => {
    expect(() => runInBackground(Promise.reject(new Error('x')))).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
  })
})
