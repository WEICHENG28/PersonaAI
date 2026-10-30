// C5 结果页资料：读取结果、让分身继续聊（跑完后重新读取）。拥有者：C。
import { useCallback, useEffect, useState } from 'react'
import { continueTwin, getResult, TwinApiError, type ResultView } from '@lib/api/twin'
import { RESULT_TEXT } from './resultView'

export interface ResultState {
  view: ResultView | null
  loadError: string | null
  /** 分身正在继续聊（请求还没回来）。 */
  continuing: boolean
  notice: string | null
  /** 成功回 true（画面会展开完整纪录）。 */
  continueChat(): Promise<boolean>
}

function messageOf(err: unknown): string {
  return err instanceof TwinApiError ? err.message : '出了点问题，再试一次？'
}

export function useResult(conversationId: string): ResultState {
  const [view, setView] = useState<ResultView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [continuing, setContinuing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

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

  return { view, loadError, continuing, notice, continueChat }
}
