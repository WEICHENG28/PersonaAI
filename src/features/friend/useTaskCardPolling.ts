import { useCallback, useEffect, useRef, useState } from 'react'
import { getFriendMessages, type FriendMessage } from '../../lib/api/friend'
import { mergeInitializedHistory, pollTaskCard } from './chatState'

interface PollingDeps {
  fetchMessages(): Promise<FriendMessage[]>
  setMessages(update: (prev: FriendMessage[]) => FriendMessage[]): void
  onTask(taskId: string): void
  onPending(pending: boolean): void
}

/** 頁面生命週期內的輪詢；後續送出不會取消較早任務或取代聊天列表。 */
export function createTaskCardPolling(deps: PollingDeps) {
  let active = true, pending = 0
  const claimedIds = new Set<string>()
  return {
    async start(sinceIso: string): Promise<void> {
      if (!active) return
      pending++
      deps.onPending(true)
      try {
        const message = await pollTaskCard(deps.fetchMessages, sinceIso, { isCancelled: () => !active, claimedIds })
        if (!active || !message) return
        deps.setMessages(prev => active ? mergeInitializedHistory(prev, [message]) : prev)
        if (message.kind === 'task_card' && typeof message.meta.taskId === 'string') {
          deps.onTask(message.meta.taskId)
        }
      } finally {
        pending--
        if (active) deps.onPending(pending > 0)
      }
    },
    stop() { active = false },
  }
}

export function useTaskCardPolling(
  setMessages: PollingDeps['setMessages'], onTask: PollingDeps['onTask'],
) {
  const [taskPending, setTaskPending] = useState(false)
  const polling = useRef<ReturnType<typeof createTaskCardPolling> | null>(null)
  useEffect(() => {
    const current = createTaskCardPolling({ fetchMessages: getFriendMessages, setMessages, onTask, onPending: setTaskPending })
    polling.current = current
    return () => { current.stop(); polling.current = null }
  }, [setMessages, onTask])
  const onTaskPending = useCallback((sinceIso: string) => { void polling.current?.start(sinceIso) }, [])
  return { taskPending, onTaskPending }
}
