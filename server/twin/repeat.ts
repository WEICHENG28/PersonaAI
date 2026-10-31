// 分身重複句偵測（C 線品質修正）。擁有者：C。
// 實跑時分身會把同一句話說好幾次（例如「咖啡确实是我露营时不会漏掉的东西」說了 3 次），
// 評審因此判「鬼打墙」。twinReply 產生訊息後用這裡比對自己這場說過的話，太像就重新產生一次。
// 除了整則比對，也逐句比對：實測重複常是長訊息裡的一句（「我通常带一点简单的轻食」隔 6 輪又說一次）。

/** 兩則都至少這麼長才用「包含」與相似度判斷；太短的（「好呀」「哈哈」）只看完全相同。 */
const MIN_FUZZY_LENGTH = 6
/** 拿掉重複句後至少要剩這麼多字，才送出剩下的部分。 */
const MIN_LEFTOVER_LENGTH = 4
/** 短的那則至少這麼長，才把「被另一則完整包含」當成重複。 */
const MIN_CONTAIN_LENGTH = 8
/** 字元二元組的 Dice 相似度達到這個值就算幾乎一樣。 */
export const REPEAT_SIMILARITY = 0.75
/** 口頭禪：這麼長的片段（去標點後）在自己最近 CATCHPHRASE_WINDOW 則裡出現 CATCHPHRASE_HITS 則以上，又要再說一次。 */
export const CATCHPHRASE_LENGTH = 6
export const CATCHPHRASE_WINDOW = 3
export const CATCHPHRASE_HITS = 2

/** 去掉標點、符號（含 emoji）與空白，只留文字和數字。 */
export function normalizeForRepeat(text: string): string {
  return text.replace(/[\p{P}\p{S}\s]/gu, '')
}

function bigrams(text: string): Map<string, number> {
  const chars = [...text]
  const counts = new Map<string, number>()
  for (let i = 0; i < chars.length - 1; i++) {
    const key = chars[i]! + chars[i + 1]!
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

/** 字元二元組的 Dice 係數（0～1）。 */
export function bigramSimilarity(a: string, b: string): number {
  const x = bigrams(a)
  const y = bigrams(b)
  let total = 0
  for (const n of x.values()) total += n
  for (const n of y.values()) total += n
  if (total === 0) return a === b ? 1 : 0
  let overlap = 0
  for (const [key, n] of x) overlap += Math.min(n, y.get(key) ?? 0)
  return (2 * overlap) / total
}

/** 兩則訊息幾乎一樣：去掉標點後相同、短的被長的整句包含，或相似度很高。 */
export function isNearDuplicate(a: string, b: string): boolean {
  const x = normalizeForRepeat(a)
  const y = normalizeForRepeat(b)
  if (!x || !y) return false
  if (x === y) return true
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  if ([...short].length < MIN_FUZZY_LENGTH) return false
  if ([...short].length >= MIN_CONTAIN_LENGTH && long.includes(short)) return true
  return bigramSimilarity(x, y) >= REPEAT_SIMILARITY
}

/** 切成句子（保留句尾的問號，方便找出問句）；逗號不切。 */
export function splitSentences(text: string): string[] {
  return (text.match(/[^。！？!?～~\n]+[。！？!?～~]*/g) ?? []).map((x) => x.trim()).filter(Boolean)
}

/** 夠長、比對起來有意義的句子（「好呀」「哈哈」這種不算）。 */
function meaningfulSentences(text: string): string[] {
  return splitSentences(text).filter((x) => [...normalizeForRepeat(x)].length >= MIN_FUZZY_LENGTH)
}

/**
 * 回傳新訊息重複到的舊內容（整則或其中一句）；沒有就回 null。
 * previous 是自己之前說過的訊息（對方說的不要傳進來）。
 */
export function findRepeat(message: string, previous: readonly string[]): string | null {
  const whole = previous.find((p) => isNearDuplicate(message, p))
  if (whole) return whole
  const oldSentences = previous.flatMap(meaningfulSentences)
  for (const sentence of meaningfulSentences(message)) {
    const hit = oldSentences.find((old) => isNearDuplicate(sentence, old))
    if (hit) return hit
  }
  return null
}

/**
 * 口頭禪：新訊息裡有一段 6 字以上的片段，在自己最近 3 則裡已經出現 2 則以上（實測：「完全停不下来」幾乎每則都說）。
 * 回傳那段片段；沒有就回 null。
 */
export function findCatchphrase(message: string, previous: readonly string[]): string | null {
  const recent = previous.slice(-CATCHPHRASE_WINDOW).map(normalizeForRepeat)
  const chars = [...normalizeForRepeat(message)]
  for (let i = 0; i + CATCHPHRASE_LENGTH <= chars.length; i++) {
    const piece = chars.slice(i, i + CATCHPHRASE_LENGTH).join('')
    if (recent.filter((r) => r.includes(piece)).length >= CATCHPHRASE_HITS) return piece
  }
  return null
}

/**
 * 重新產生後還是重複時的最後一步：拿掉和自己說過的話幾乎一樣的句子。
 * 拿掉後剩不到 MIN_LEFTOVER_LENGTH 個字（整則都是重複，或只剩「好呀」）就原樣回傳，不送出空訊息。
 */
export function dropRepeatedSentences(message: string, previous: readonly string[]): string {
  const oldSentences = previous.flatMap(meaningfulSentences)
  const kept = splitSentences(message).filter((x) => {
    if ([...normalizeForRepeat(x)].length < MIN_FUZZY_LENGTH) return true
    return !oldSentences.some((old) => isNearDuplicate(x, old))
  })
  const result = kept.join('')
  return [...normalizeForRepeat(result)].length >= MIN_LEFTOVER_LENGTH ? result : message
}

/** 自己問過的問題（以問號結尾的句子），給 Prompt 列出來提醒不要再問。 */
export function askedQuestions(previous: readonly string[]): string[] {
  return previous.flatMap(splitSentences).filter((x) => /[？?]$/.test(x))
}

/** 重新產生時給模型的提示。 */
export function repeatInstruction(repeated: string): string {
  return `你刚才想说的和你之前说过的「${repeated}」几乎一样，不要重复。换一个新的内容：先回应对方最后一则消息，再带出一个新的看法、感受、偏好或子话题`
}

/** 口頭禪重新產生時給模型的提示。 */
export function catchphraseInstruction(phrase: string): string {
  return `「${phrase}」这种说法你最近已经说了好几次，这一则不要再用，换别的说法，并带出一个新的看法、感受、偏好或子话题`
}

/** 整則／逐句重複或口頭禪：回傳重新產生時要給模型的提示；沒有問題就回 null。 */
export function repeatProblem(message: string, previous: readonly string[]): string | null {
  const repeated = findRepeat(message, previous)
  if (repeated) return repeatInstruction(repeated)
  const phrase = findCatchphrase(message, previous)
  return phrase ? catchphraseInstruction(phrase) : null
}
