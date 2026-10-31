import type { Candidate } from '@lib/api/types'

/**
 * Demo 大厅助手（UX #26）：依问题关键词比对候选人的兴趣与聊天风格。
 * 找不到就老实说；之前判定不合适的人（excludedNames）不推荐。只在 mock 模式用。
 */

export const NO_MATCH_ANSWER = '大厅里暂时没有符合的人，要不要让社交 Agent 帮你去找？'

/** 兴趣的近义说法 */
const INTEREST_SYNONYMS: Record<string, string[]> = {
  登山: ['爬山', '户外', '徒步'],
  看展: ['展览', '展'],
  咖啡: ['咖啡馆'],
  读书: ['看书', '书'],
  电影: ['看片', '影'],
  跑步: ['运动', '健身', '铁人'],
  摄影: ['拍照', '相机'],
}

/** 问题里的个性描述 → 聊天风格里的字 */
const STYLE_RULES: { ask: RegExp; style: RegExp }[] = [
  { ask: /安静|慢热|内向|话不多/, style: /慢热|温和/ },
  { ask: /热情|外向|活泼|节奏快|直接/, style: /热情|快|直接/ },
  { ask: /会聊|健谈|话题/, style: /延伸|追问/ },
]

const ASKS_BEST = /合|推荐|谁/

function matchedInterests(q: string, c: Candidate): string[] {
  return c.interests.filter((i) => q.includes(i) || (INTEREST_SYNONYMS[i] ?? []).some((s) => q.includes(s)))
}

function styleMatches(q: string, c: Candidate): boolean {
  return STYLE_RULES.some((r) => r.ask.test(q) && r.style.test(c.chatStyle))
}

function asksStyle(q: string): boolean {
  return STYLE_RULES.some((r) => r.ask.test(q))
}

export function answerLobbyQuestion(question: string, candidates: Candidate[], excludedNames: string[]): string {
  const q = question.trim()
  const pool = candidates.filter((c) => !excludedNames.includes(c.name))
  const wantsInterest = candidates.some((c) => matchedInterests(q, c).length > 0)
  const wantsStyle = asksStyle(q)

  if (wantsInterest || wantsStyle) {
    const hits = pool.filter((c) => {
      const okInterest = !wantsInterest || matchedInterests(q, c).length > 0
      const okStyle = !wantsStyle || styleMatches(q, c)
      return okInterest && okStyle
    })
    if (hits.length === 0) return NO_MATCH_ANSWER
    const list = hits.map((c) => {
      const tags = matchedInterests(q, c)
      return `${c.name}（${tags.length > 0 ? `${tags.join('、')} · ` : ''}${c.chatStyle}）`
    })
    return `符合的有：${list.join('；')}。想认识谁，可以点下面卡片上的按钮。`
  }

  if (ASKS_BEST.test(q)) {
    const best = [...pool].sort((a, b) => b.fitPredict - a.fitPredict)[0]
    if (!best) return NO_MATCH_ANSWER
    return `以你的档案看，${best.name}可能跟你最聊得来：共同兴趣有${best.interests.join('、')}，聊天风格是「${best.chatStyle}」。`
  }

  return NO_MATCH_ANSWER
}
