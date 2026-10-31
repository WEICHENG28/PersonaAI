import type { Memory, ShareableProfile } from '@lib/api/types'

/**
 * Demo 档案草稿（UX #33）：只从聊天产生的记忆整理，不预填假资料。
 * 用户自己编辑或确认过之后就不再覆盖（由 store 判断）。
 */

const MEMORY_TAGS: { test: RegExp; tags: string[] }[] = [
  { test: /漫展|动漫|二次元/, tags: ['动漫', '漫展'] },
  { test: /登山|爬山/, tags: ['登山（新手）'] },
  { test: /看展|展览/, tags: ['看展'] },
]

export const EMPTY_PROFILE: ShareableProfile = { intro: '', interests: [], chatStyle: '', confirmed: false }

/** 还在观察时的聊天风格说明（不假装已经知道） */
export const STYLE_OBSERVING = '还在观察中，多聊几句阿澈会更了解你的聊天风格'

export function draftProfile(memories: Pick<Memory, 'content'>[]): ShareableProfile {
  const interests = [...new Set(MEMORY_TAGS.filter((r) => memories.some((m) => r.test.test(m.content))).flatMap((r) => r.tags))]
  const intro =
    interests.length > 0
      ? `喜欢${interests.slice(0, 3).join('、')}，想认识聊得来的新朋友。`
      : '刚开始和阿澈聊天，还在慢慢认识自己。'
  return { intro, interests, chatStyle: STYLE_OBSERVING, confirmed: false }
}
