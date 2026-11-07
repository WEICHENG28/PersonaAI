interface NotificationFeedDeps {
  subscribe(onChange: () => void, onFailed: () => void): () => void
  reload(): void
  onFailed(): void
}

const STARTUP_FALLBACK_MS = 2000

/** 首次订阅就绪时读一次；连接失败或迟迟未就绪时仍能看到通知。 */
export function startNotificationFeed(deps: NotificationFeedDeps): () => void {
  let active = true
  let loaded = false
  const reload = () => {
    if (!active) return
    loaded = true
    clearTimeout(timer)
    deps.reload()
  }
  const timer = setTimeout(reload, STARTUP_FALLBACK_MS)
  const unsubscribe = deps.subscribe(reload, () => {
    if (!active) return
    if (!loaded) reload()
    deps.onFailed()
  })
  return () => {
    active = false
    clearTimeout(timer)
    unsubscribe()
  }
}
