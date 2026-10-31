import { useState } from 'react'
import { splitInterests } from './splitInterests'

/** 两种模式统一的兴趣输入提示（UX #3） */
export const INTERESTS_HINT = '用逗号、顿号或空格分隔'

/**
 * 兴趣输入框：框里保留用户实际打的字（包含结尾的分隔符），只在背后拆成兴趣列表。
 * 之前直接用 interests.join('、') 当 value，打下「、」的瞬间会被当成空项删掉，所以打不出分隔符。
 */
export function InterestsInput({ value, onChange }: { value: string[]; onChange: (interests: string[]) => void }) {
  const [text, setText] = useState(() => value.join('、'))
  return (
    <input
      className="input"
      value={text}
      placeholder={INTERESTS_HINT}
      onChange={(e) => {
        setText(e.target.value)
        onChange(splitInterests(e.target.value))
      }}
    />
  )
}
