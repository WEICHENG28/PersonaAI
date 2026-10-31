// 真人／示範用戶的標示（Peter 2026-10-31）：示範用戶是虛構角色，回報、通知、歷史都要讓用戶知道。擁有者：B。
export const PERSON_TAG = { real: '真人', seed: '示范用户' } as const

export function personTag(isSeed: boolean): string {
  return isSeed ? PERSON_TAG.seed : PERSON_TAG.real
}

/** 「子晴（示范用户）」「小安（真人）」 */
export function withPersonTag(name: string, isSeed: boolean): string {
  return `${name}（${personTag(isSeed)}）`
}
