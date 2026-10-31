import {
  friendFallbacks,
  friendGreetings,
  friendScript,
  friendSelfShares,
  type FriendBeat,
} from './scenario'

/**
 * Demo：阿澈挑下一句回复（UX #5）。一定会回话，不会沉默。
 * 顺序：关键词（只用一次）→ 打招呼 → 问阿澈问题 → 聊熟后的小事（只用一次）→ 通用回复。
 */

export interface FriendReplyInput {
  text: string
  /** 已用过的一次性剧本编号 */
  usedIds: string[]
  /** 含这一句，用户总共说了几句 */
  userCount: number
  /** 阿澈最近说过的话（避免连续重复） */
  recentTexts: string[]
}

export interface FriendReply {
  id: string
  text: string
  memory?: FriendBeat['memory']
  /** true：剧本只用一次，store 要记进 usedIds */
  once: boolean
}

const GREETING = /你好|您好|嗨|在吗|^\s*(hi|hello|hey)\b/i
const ASKS_FRIEND = /你.*(吗|什么|怎样|怎么样|[？?])\s*$/

/** 从池子里挑一则，避开最近说过的话；依 userCount 轮流 */
function pickFrom(pool: string[], prefix: string, input: FriendReplyInput): FriendReply {
  for (let k = 0; k < pool.length; k++) {
    const i = (input.userCount + k) % pool.length
    const text = pool[i]!
    if (!input.recentTexts.includes(text)) return { id: `${prefix}-${i}`, text, once: false }
  }
  const i = input.userCount % pool.length
  return { id: `${prefix}-${i}`, text: pool[i]!, once: false }
}

function fromBeat(b: FriendBeat): FriendReply {
  return { id: b.id, text: b.text, memory: b.memory, once: true }
}

export function pickFriendReply(input: FriendReplyInput): FriendReply {
  const remaining = friendScript.filter((b) => !input.usedIds.includes(b.id))

  const keyword = remaining.find((b) => b.when === 'keyword' && b.keywords?.some((k) => input.text.includes(k)))
  if (keyword) return fromBeat(keyword)

  if (GREETING.test(input.text)) return pickFrom(friendGreetings, 'greet', input)
  if (ASKS_FRIEND.test(input.text)) return pickFrom(friendSelfShares, 'self', input)

  const story = remaining.find((b) => b.when === 'story' && (b.afterN ?? 0) <= input.userCount)
  if (story) return fromBeat(story)

  return pickFrom(friendFallbacks, 'fallback', input)
}
