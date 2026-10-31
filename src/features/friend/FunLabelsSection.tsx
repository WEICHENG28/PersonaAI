import { useEffect, useState } from 'react'
import { Button, Chip } from '@components/ui/Button'
import { Card, CardHead } from '@components/ui/Card'
import { fetchFunLabels, generateFunLabels, isHttpMode, setUserMbti, type FunLabels } from '@lib/api/friend'

/** 显示 AI 猜测的 MBTI 与用户自填 MBTI 的对照（仅供娱乐）。
 *  http 模式：GET /api/profile/fun 加载；POST 生成；PUT 自填。
 *  mock 模式：不显示（P2 占位符）。
 */
export function FunLabelsSection() {
  const httpMode = isHttpMode
  const [funLabels, setFunLabels] = useState<FunLabels | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userMbtiDraft, setUserMbtiDraft] = useState('')
  const [savingMbti, setSavingMbti] = useState(false)

  useEffect(() => {
    if (!httpMode) return
    fetchFunLabels().then((d) => {
      if (d) {
        setFunLabels(d)
        setUserMbtiDraft(d.user_mbti ?? '')
      }
    }).catch(console.error)
  }, [httpMode])

  if (!httpMode) return null  // mock 模式不显示（P2）

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await generateFunLabels()
      setFunLabels(data)
      setUserMbtiDraft(data.user_mbti ?? '')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '生成失败，请再试一次')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveMbti = async () => {
    const val = userMbtiDraft.trim().toUpperCase()
    const isValid = /^[EI][NS][TF][JP]$/.test(val)
    const mbti = val && isValid ? val : null
    setSavingMbti(true)
    try {
      const data = await setUserMbti(mbti)
      setFunLabels(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSavingMbti(false)
    }
  }

  return (
    <Card>
      <CardHead
        title="性格小报告"
        sub="仅供娱乐，不用于任何判定"
        right={<Chip tone="pear">仅供娱乐</Chip>}
      />

      {!funLabels ? (
        <div className="stack" style={{ gap: '0.75rem' }}>
          <p className="hint-inline">AI 会根据你的对外档案猜测你的 MBTI，写一段轻松的性格小报告。</p>
          {error && <p style={{ color: 'var(--c-err)' }}>{error}</p>}
          <Button small variant="secondary" onClick={() => void handleGenerate()} disabled={loading}>
            {loading ? '生成中…' : '生成性格小报告'}
          </Button>
        </div>
      ) : (
        <div className="stack" style={{ gap: '1rem' }}>
          {/* AI 猜测 */}
          <div>
            <p style={{ fontWeight: 600 }}>AI 猜你是：<Chip tone="pear">{funLabels.mbti_guess}</Chip></p>
            <p className="hint-inline">{funLabels.reason}</p>
            <p style={{ marginTop: '0.5rem' }}>{funLabels.report}</p>
          </div>

          {/* 你以为的你 vs AI 猜的你 */}
          <div>
            <p style={{ fontWeight: 600 }}>你以为自己是：</p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                className="input"
                placeholder="输入 MBTI（如 INFP）"
                value={userMbtiDraft}
                onChange={(e) => setUserMbtiDraft(e.target.value.toUpperCase())}
                maxLength={4}
                style={{ maxWidth: 120 }}
              />
              <Button small variant="secondary" onClick={() => void handleSaveMbti()} disabled={savingMbti}>
                {savingMbti ? '保存中…' : '确认'}
              </Button>
              {funLabels.user_mbti && funLabels.user_mbti !== funLabels.mbti_guess && (
                <span className="hint-inline">你说 {funLabels.user_mbti}，AI 猜 {funLabels.mbti_guess}，有点不同 😄</span>
              )}
              {funLabels.user_mbti && funLabels.user_mbti === funLabels.mbti_guess && (
                <span className="hint-inline">你说 {funLabels.user_mbti}，AI 也猜 {funLabels.mbti_guess}，想法一致！</span>
              )}
            </div>
          </div>

          {error && <p style={{ color: 'var(--c-err)' }}>{error}</p>}
          <Button small variant="secondary" onClick={() => void handleGenerate()} disabled={loading}>
            {loading ? '重新生成中…' : '重新生成'}
          </Button>
        </div>
      )}
    </Card>
  )
}
