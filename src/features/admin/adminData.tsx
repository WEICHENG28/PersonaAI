// 管理後台各分頁共用：載入資料（loading／錯誤／重新整理）。擁有者：B。
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@components/ui/Button'

/** 载入资料的小工具：loading／错误／重新整理。 */
export function useAdminData<T>(load: () => Promise<T>, onAuthError: (e: unknown) => void, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    load()
      .then(setData)
      .catch((e: unknown) => {
        onAuthError(e)
        setError(e instanceof Error ? e.message : '读取失败')
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(reload, [reload])
  return { data, error, loading, reload }
}

export function PanelStatus({ loading, error, reload }: { loading: boolean; error: string | null; reload(): void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
      {loading && <span className="hint-inline">读取中…</span>}
      {error && <span className="login-error">{error}</span>}
      <span style={{ marginLeft: 'auto' }}>
        <Button small variant="secondary" disabled={loading} onClick={reload}>
          重新整理
        </Button>
      </span>
    </div>
  )
}

