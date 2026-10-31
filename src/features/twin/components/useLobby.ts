// C9 大厅资料：依筛选读取卡片；「我自己聊」「让分身去聊」（大厅卡片和助手小卡片共用）。拥有者：C。
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getLobby,
  startHumanChat,
  startTwinChat,
  TwinApiError,
  type LobbyCardView,
  type LobbyFilterInput,
} from '@lib/api/twin'

export type LobbyAction = 'human' | 'twin'

export function messageOf(err: unknown): string {
  return err instanceof TwinApiError ? err.message : '出了点问题，再试一次？'
}

export interface LobbyCardsState {
  cards: LobbyCardView[] | null
  loadError: string | null
  reload(): void
}

export function useLobbyCards(filter: LobbyFilterInput): LobbyCardsState {
  const [cards, setCards] = useState<LobbyCardView[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // 筛选换得快时只采用最后一次的结果
  const requestId = useRef(0)
  const { purpose, q } = filter

  const reload = useCallback(() => {
    const id = ++requestId.current
    setCards(null)
    setLoadError(null)
    getLobby({ purpose, q })
      .then((data) => {
        if (id === requestId.current) setCards(data)
      })
      .catch((err: unknown) => {
        if (id === requestId.current) setLoadError(messageOf(err))
      })
  }, [purpose, q])

  useEffect(() => {
    reload()
  }, [reload])

  return { cards, loadError, reload }
}

export interface StartChatState {
  /** 正在处理哪张卡片的哪个按钮（同时只处理一个）。 */
  pending: { userId: string; action: LobbyAction } | null
  /** 按钮失败的讯息（放在那张卡片下面）。 */
  actionError: { userId: string; message: string } | null
  /** 成功回 conversationId（human）或 taskId（twin）；失败回 null。 */
  start(userId: string, action: LobbyAction): Promise<string | null>
}

export function useStartChat(): StartChatState {
  const [pending, setPending] = useState<StartChatState['pending']>(null)
  const [actionError, setActionError] = useState<StartChatState['actionError']>(null)

  const start = useCallback(
    async (userId: string, action: LobbyAction): Promise<string | null> => {
      if (pending) return null
      setPending({ userId, action })
      setActionError(null)
      try {
        if (action === 'human') return (await startHumanChat(userId)).conversationId
        return (await startTwinChat(userId)).taskId
      } catch (err) {
        setActionError({ userId, message: messageOf(err) })
        return null
      } finally {
        setPending(null)
      }
    },
    [pending],
  )

  return { pending, actionError, start }
}
