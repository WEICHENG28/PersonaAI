/**
 * 敏感詞檢查（防濫用）：用戶送出的文字有不適合的內容就擋下，AI 產生的文字就把詞遮掉。
 * 這是基本的關鍵字版本；正式對外上線建議接雲端內容安全服務（例如阿里雲／騰訊雲內容安全），換掉 findBlocked 即可。
 * 不擋「想不開」之類求助的話：那種要讓阿澈接住並給求助資源（CONFIG.CRISIS_RESOURCE），不是封鎖。擁有者：B。
 */
import { BLOCKED_WORDS } from './moderationWords.js'

export const BLOCKED_MESSAGE = '内容里有不适合的词，换个说法吧'

/** 比對前先去掉空白和常見的分隔符號（避免「约 炮」「赌.博」這種繞法）。 */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s.\-_*·、，,。|/\\]+/g, '')
}

/** 回傳命中的詞（沒有就是 null）。 */
export function findBlocked(text: string, words: readonly string[] = BLOCKED_WORDS): string | null {
  const plain = normalize(text)
  return words.find((w) => plain.includes(normalize(w))) ?? null
}

/** AI 產生的文字：把命中的詞換成 ＊＊。 */
export function maskBlocked(text: string, words: readonly string[] = BLOCKED_WORDS): string {
  return words.reduce((out, w) => out.split(w).join('＊'.repeat(Math.min(w.length, 4))), text)
}

/** 用戶送出的文字：有敏感詞就丟出錯誤（各路由照自己的錯誤格式回 400）。 */
export class BlockedContentError extends Error {
  readonly status = 400
  constructor(readonly word: string) {
    super(BLOCKED_MESSAGE)
    this.name = 'BlockedContentError'
  }
}

export function assertAllowed(...texts: (string | undefined | null)[]): void {
  for (const t of texts) {
    if (!t) continue
    const hit = findBlocked(t)
    if (hit) throw new BlockedContentError(hit)
  }
}
