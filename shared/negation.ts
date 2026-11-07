/** M-1 共用规则：否定词仅使用计划核准的 pattern，不推测自由文本语意。 */
export const NEGATION_PATTERN = /(不太?喜欢|不爱|讨厌|不感兴趣|没(什么|啥)?兴趣|不想|(?<!哪)怕|受不了|反感|不再|不(吃|喝|玩|看|碰))/

export function isNegated(text: string): boolean {
  return NEGATION_PATTERN.test(text)
}

export function stripLikePrefix(text: string): string {
  return text.trim().replace(/^(我)?(很|超|特别|比较|最)?(喜欢|爱)/, '').trim()
}

export function conditionKeyword(condition: string): { key: string; negated: boolean } {
  const text = condition.trim()
  const match = NEGATION_PATTERN.exec(text)
  if (!match) return { key: stripLikePrefix(text), negated: false }
  const after = stripLikePrefix(text.slice(match.index + match[0].length))
  // 后置否定（如「对昆虫不感兴趣」）保留前方主题；「对」仅是介词，不扩充否定词。
  const before = text.slice(0, match.index).trim().replace(/^(我)?对/, '').trim()
  return { key: after || stripLikePrefix(before), negated: true }
}
