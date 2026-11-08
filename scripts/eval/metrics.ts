// E-1 評測指標（純函式，不打模型）：問號結尾、問號比例、和參考句的最高相似度（照抄偵測）。
import { bigramSimilarity, normalizeForRepeat } from '../../server/twin/repeat.js'

/** 結尾的 emoji（含膚色）、微信表情「[捂脸]」、空白、收尾標點和括號引號不算，看最後一個實際的句尾是不是問號。 */
export function endsWithQuestion(text: string): boolean {
  const trimmed = text
    .replace(/(\[[^\[\]\s]{1,6}\]\s*)+$/u, '')
    .replace(/[\s\p{Extended_Pictographic}\p{Emoji_Modifier}‍️。.!！~～…）)」』"'”’]+$/gu, '')
  return /[？?]$/.test(trimmed)
}

/** 以問號結尾的比例（0～1）；沒有資料回傳 0。 */
export function questionRatio(texts: readonly string[]): number {
  if (texts.length === 0) return 0
  return texts.filter(endsWithQuestion).length / texts.length
}

/** 和一組參考句（例如示範對話）的最高字元二元組相似度；≥ 0.6 視為照抄。 */
export function maxBigramSimilarity(text: string, refs: readonly string[]): number {
  const a = normalizeForRepeat(text)
  let best = 0
  for (const ref of refs) best = Math.max(best, bigramSimilarity(a, normalizeForRepeat(ref)))
  return best
}

export const COPY_THRESHOLD = 0.6
