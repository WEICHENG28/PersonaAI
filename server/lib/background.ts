/**
 * 回覆送出後還要做完的背景工作（例如阿澈回話後整理記憶、檔案）。
 * Vercel 送出回應後可能直接凍結函式，沒做完的工作就會不見；這裡交給 Vercel 的 waitUntil，等它做完才收。
 * 取 waitUntil 的方式和官方 @vercel/functions 相同（讀 Vercel 放在 globalThis 的 request context），所以不用另裝套件。
 * 本機 npm run server 沒有這個 context，工作照樣在背景跑。擁有者：B。
 */
const CONTEXT_KEY = Symbol.for('@vercel/request-context')

type RequestContext = { get?: () => { waitUntil?: (p: Promise<unknown>) => void } | undefined }

export function runInBackground(task: Promise<unknown>): void {
  const safe = task.catch(() => {}) // 錯誤由呼叫端自己的 .catch 記錄；這裡只確保不會 unhandled
  try {
    const ctx = (globalThis as Record<symbol, RequestContext | undefined>)[CONTEXT_KEY]
    ctx?.get?.()?.waitUntil?.(safe)
  } catch {
    // 拿不到 context 就當一般背景工作
  }
}

/** 延迟与异步执行全程属于同一个 waitUntil 任务。失败仅记录固定警告。 */
export function scheduleInBackground(ms: number, run: () => void | Promise<void>): void {
  runInBackground(new Promise<void>(resolve => {
    setTimeout(async () => {
      try { await run() }
      catch { console.warn('延迟背景任务执行失败') }
      finally { resolve() }
    }, ms)
  }))
}
