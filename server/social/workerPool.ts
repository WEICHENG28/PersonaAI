/**
 * worker 的排程：每次 tick 把 running 任務分給最多 concurrency 個「同時在跑」的位置。
 * 原本一個任務跑完才輪下一個，人一多每個任務要等好幾分鐘；現在同時推進，同一任務不會重疊。
 * 任務比位置多時，最久沒跑的先跑（不會有任務一直排不到）。
 * tick 不等任務跑完就回來，跑完的任務會自己讓出位置。擁有者：B。
 */
export interface WorkerPoolDeps {
  listRunning(): Promise<string[]>
  runStep(taskId: string): Promise<string>
  concurrency: number
  log?(taskId: string, outcome: string): void
  onError?(taskId: string, err: unknown): void
}

export function createWorkerPool(deps: WorkerPoolDeps) {
  const inFlight = new Map<string, Promise<void>>()
  const lastStarted = new Map<string, number>()
  let counter = 0

  function start(id: string) {
    const job = deps
      .runStep(id)
      .then((outcome) => deps.log?.(id, outcome))
      .catch((err) => deps.onError?.(id, err))
      .finally(() => inFlight.delete(id))
    inFlight.set(id, job)
    lastStarted.set(id, ++counter)
  }

  return {
    /** 開始新的步驟；回傳這次新開了幾個。 */
    async tick(): Promise<number> {
      const ids = await deps.listRunning()
      // 從來沒跑過的排最前面，其餘照上次開始的先後
      const order = [...ids].sort((a, b) => (lastStarted.get(a) ?? 0) - (lastStarted.get(b) ?? 0))
      for (const id of [...lastStarted.keys()]) if (!ids.includes(id)) lastStarted.delete(id)
      let started = 0
      for (const id of order) {
        if (inFlight.size >= Math.max(1, deps.concurrency)) break
        if (inFlight.has(id)) continue // 同一任務上一步還沒跑完
        start(id)
        started++
      }
      return started
    },
    /** 測試或關閉時用：等目前在跑的都結束。 */
    async drain(): Promise<void> {
      await Promise.all([...inFlight.values()])
    },
    get running(): number {
      return inFlight.size
    },
  }
}
