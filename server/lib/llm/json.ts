// 從模型輸出擷取 JSON：平台不支援 json_object 模式時，回應可能夾雜說明文字或 ```json 區塊。

/** 回傳第一段完整的 JSON 物件或陣列字串；找不到時回傳 null。 */
export function extractJson(text: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const source = fenced?.[1] ?? text
  const start = source.search(/[{[]/)
  if (start === -1) return null

  const open = source[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < source.length; i++) {
    const ch = source[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === open) depth++
    else if (ch === close && --depth === 0) return source.slice(start, i + 1)
  }
  return null
}
