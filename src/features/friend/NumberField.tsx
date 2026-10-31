import { useEffect, useState } from 'react'

interface NumberFieldProps {
  value: number
  min: number
  max: number
  unit: string
  /** 失焦后、通过验证（或夹回范围）才呼叫 */
  onCommit: (v: number) => void
  disabled?: boolean
}

/** 失焦时才验证 */
export function clampNumber(text: string, min: number, max: number, fallback: number): { value: number; adjusted: boolean } {
  const n = Number(text)
  if (text.trim() === '' || !Number.isFinite(n)) return { value: fallback, adjusted: true }
  const value = Math.min(max, Math.max(min, Math.round(n)))
  return { value, adjusted: value !== n }
}

/** 数字栏位（UX #20）：允许暂时清空，失焦才验证；超出范围夹回并提示。 */
export function NumberField({ value, min, max, unit, onCommit, disabled }: NumberFieldProps) {
  const [text, setText] = useState(String(value))
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => setText(String(value)), [value])

  const commit = () => {
    const r = clampNumber(text, min, max, value)
    setText(String(r.value))
    setHint(r.adjusted ? `请输入 ${min}～${max} ${unit}，已改为 ${r.value}` : null)
    if (r.value !== value) onCommit(r.value)
  }

  return (
    <div className="stack number-field">
      <input
        className="input"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {hint && (
        <p className="hint-inline" role="status">
          {hint}
        </p>
      )}
    </div>
  )
}
