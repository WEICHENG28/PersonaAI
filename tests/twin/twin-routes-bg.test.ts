import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { scheduleInBackground } from '../../server/lib/background.js'
const key = Symbol.for('@vercel/request-context')
const contexts = globalThis as Record<symbol, unknown>
let previous: unknown
let tasks: Promise<unknown>[]
beforeEach(() => {
  vi.useFakeTimers(); tasks = []; previous = contexts[key]
  contexts[key] = { get: () => ({ waitUntil: (task: Promise<unknown>) => tasks.push(task) }) }
})
afterEach(() => { contexts[key] = previous; vi.useRealTimers() })
it('registers the delayed task immediately and runs only after the delay', async () => {
  const run = vi.fn()
  scheduleInBackground(3000, run)
  expect(tasks).toHaveLength(1)
  await vi.advanceTimersByTimeAsync(2999); expect(run).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1); await tasks[0]
  expect(run).toHaveBeenCalledOnce()
})
it('keeps the runInBackground promise pending until async run finishes', async () => {
  let release!: () => void
  const run = vi.fn(() => new Promise<void>(resolve => { release = resolve }))
  scheduleInBackground(10, run)
  let finished = false
  void tasks[0]!.then(() => { finished = true })
  await vi.advanceTimersByTimeAsync(10)
  expect(run).toHaveBeenCalledOnce()
  expect(finished).toBe(false)
  release(); await tasks[0]; expect(finished).toBe(true)
})
it.each([false, true])('settles safely after callback failure, async=%s', async asyncFailure => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  scheduleInBackground(1, () => {
    if (asyncFailure) return Promise.reject(new Error('private'))
    throw new Error('private')
  })
  await vi.advanceTimersByTimeAsync(1)
  await expect(tasks[0]).resolves.toBeUndefined()
  expect(warning).toHaveBeenCalled()
  expect(JSON.stringify(warning.mock.calls)).not.toContain('private')
  warning.mockRestore()
})
