// C5 结果页资料：读取结果、让分身继续聊（跑完后重新读取）；C6 本人接手。拥有者：C。
import { useCallback, useEffect, useState } from 'react'
import { continueTwin, getResult, takeOver, TwinApiError, type ResultView, type TakeoverView } from '@lib/api/twin'
import { HANDOFF_TEXT } from './handoffView'
import { RESULT_TEXT } from './resultView'

export interface ResultState {
  view: ResultView | null
  loadError: string | null
  /** 分身正在继续聊（请求还没回来）。 */
  continuing: boolean
  notice: string | null
  /** 成功回 true（画面会展开完整纪录）。 */
  continueChat(): Promise<boolean>
  /** 正在接手（产生接手卡片中）。 */
  takingOver: boolean
  /** 本人接手；成功回接手卡片，失败回 null（错误放在 notice）。 */
  takeOver(): Promise<TakeoverView | null>
}

function messageOf(err: unknown): string {
  return err instanceof TwinApiError ? err.message : '出了点问题，再试一次？'
}

export function useResult(conversationId: string): ResultState {
  const [view, setView] = useState<ResultView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [continuing, setContinuing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [takingOver, setTakingOver] = useState(false)

  /** 重新读取；失败时回错误讯息（成功回 null）。 */
  const reload = useCallback(async (): Promise<string | null> => {
    try {
      setView(await getResult(conversationId))
      setLoadError(null)
      return null
    } catch (err) {
      const message = messageOf(err)
      setLoadError(message)
      return message
    }
  }, [conversationId])

  useEffect(() => {
    setView(null)
    setNotice(null)
    void reload()
  }, [reload])

  const continueChat = useCallback(async (): Promise<boolean> => {
    setContinuing(true)
    setNotice(RESULT_TEXT.continuing)
    try {
      const out = await continueTwin(conversationId)
      // 聊完了但重新读取失败：显示读取失败的讯息，不要说「已经加进纪录」
      const reloadError = await reload()
      setNotice(reloadError ?? (out.ended ? RESULT_TEXT.continuedEnded : RESULT_TEXT.continued))
      return true
    } catch (err) {
      setNotice(messageOf(err))
      // 失败前可能已经多了几则，重新读一次
      await reload()
      return false
    } finally {
      setContinuing(false)
    }
  }, [conversationId, reload])

  const takeOverNow = useCallback(async (): Promise<TakeoverView | null> => {
    setTakingOver(true)
    setNotice(HANDOFF_TEXT.taking)
    try {
      const out = await takeOver(conversationId)
      setNotice(null)
      return out
    } catch (err) {
      setNotice(messageOf(err))
      // 可能已经被接手或结束了，重新读一次让按钮状态正确
      await reload()
      return null
    } finally {
      setTakingOver(false)
    }
  }, [conversationId, reload])

  return { view, loadError, continuing, notice, continueChat, takingOver, takeOver: takeOverNow }
}
