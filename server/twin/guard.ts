// C2 隱私守門（docs/07C C2）。擁有者：C。
// guardText：先用規則遮蔽個資（maskByRules），再用 Prompt 13 檢查；LLM 改寫過的版本再檢查一次，不過就換成 GUARD_FALLBACK。
// 有改寫就寫日誌。第一次 LLM 檢查失敗時只送出規則處理後的版本。
// 個資格式以中國大陸為準（手機號 1 開頭 11 碼、18 位身份證號、微信／QQ 等帳號、小區＋棟＋單元地址）；簡繁字形都認。
// MASK、hits、issues、日誌會出現在畫面和工作日誌上，所以用簡體中文。
import type { AgentLogInput, GuardResult, ShareableProfile } from '../../shared/types.js'
import { getShareableProfile } from '../contracts/friend.js'
import { llmJson, type LlmJsonOptions } from '../lib/llm/index.js'
import { writeLog } from '../lib/log.js'
import { guardResultSchema, renderGuardSystem, renderGuardUserMessage, type GuardLlmResult } from '../prompts/13_guard.js'

export const MASK = '（已隐藏）'
/** Prompt 13：LLM 判定洩漏卻沒給改寫版時用。 */
export const GUARD_FALLBACK = '这个我之后再跟你说'
const LLM_DEFAULT_ISSUE = '可能泄露隐私'

export interface MaskResult {
  text: string
  /** 命中的個資類型（不重複），例如「手机号」。 */
  hits: string[]
}

interface MaskRule {
  name: string
  pattern: RegExp
}

// 網址遇到中文或全形標點就停，避免把後面的句子一起吃掉
const URL_CHARS = '[^\\s\\u3000-\\u303f\\u4e00-\\u9fff\\uff00-\\uffef]+'
const NUM = '[0-9０-９零〇一二三四五六七八九十百]+'
const SP = '\\s*'

// 帳號：英文開頭 3 碼以上，或純數字 5 碼以上（QQ 號）。避免把「刷抖音 30 分钟」的數字當帳號
const ACCOUNT = '(?:[A-Za-z][A-Za-z0-9_.-]{2,}|\\d{5,})'
const PLATFORMS_LATIN = '(?:QQ|WeChat|wx|vx|Weibo|Bilibili|LINE|IG|Instagram)'
const PLATFORMS_CJK = '(?:微信|威信|V信|微博|抖音|快手|小[红紅][书書]|[Bb]站|[哔嗶][哩][哔嗶][哩])'
const ACCOUNT_LABEL = '(?:[号號]|[账帳][号號户戶]|ID|id)?'

// 地名用字：排除「我住、家在、去」這類動詞和代名詞，遮蔽時才不會把「我住」一起吃掉
const PLACE = '(?:[\\u4e00-\\u9fff](?<![我你他她住在到去是的]))'
const ROAD = '(?:路|街|大道|胡同|巷)'
const COMPOUND = '(?:小[区區]|花[园園]|公寓|家[园園]|新村|社[区區]|大厦|大廈|苑)'
const BUILDING_CORE = `${NUM}${SP}(?:[号號][楼樓]|[栋棟]|幢|座)`
const BUILDING = `(?:${SP}${BUILDING_CORE})`
const FLOOR = `(?:${SP}${NUM}${SP}[楼樓层層])`
const UNIT = `(?:${SP}${NUM}${SP}[单單]元)`
// 房號要寫「室」，或是 3～4 位數字（302、1501），避免吃掉後面的「2 个人」
const ROOM = `(?:${SP}(?:${NUM}${SP}室|\\d{3,4}(?!\\d)))`

// 順序有意義：email 要比 @帳號 先處理；身份證要比手機號先處理
const RULES: readonly MaskRule[] = [
  { name: '邮箱', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { name: '网址', pattern: new RegExp(`(?:https?:\\/\\/|www\\.)${URL_CHARS}`, 'gi') },
  {
    name: '社交账号',
    pattern: new RegExp(
      `(?:(?<![A-Za-z])${PLATFORMS_LATIN}(?![A-Za-z])|${PLATFORMS_CJK})${SP}${ACCOUNT_LABEL}${SP}是?${SP}[:：]?${SP}${ACCOUNT}`,
      'gi',
    ),
  },
  { name: '社交账号', pattern: /(?<![A-Za-z0-9_.])@[A-Za-z0-9_.]{2,}/g },
  {
    // 6 位地區碼＋8 位生日＋3 位順序碼＋校驗碼（數字或 X）
    name: '身份证号',
    pattern: /(?<![0-9A-Za-z])\d{6}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?![0-9A-Za-z])/g,
  },
  // 可加 +86，可用空格或連字號分成 3-4-4
  { name: '手机号', pattern: /(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d[-\s]?\d{4}[-\s]?\d{4}(?!\d)/g },
  // 0 開頭區號 2～3 碼＋7～8 碼，例：010-12345678、(0755)12345678
  { name: '座机', pattern: /(?<!\d)(?:\(0\d{2,3}\)|0\d{2,3}[-\s])\s?\d{7,8}(?!\d)/g },
  {
    // 道路門牌：（省市區）＋路名＋（段巷弄）＋號＋（樓棟／單元／室）
    name: '地址',
    pattern: new RegExp(
      `(?:${PLACE}{1,4}[省市])?(?:${PLACE}{1,4}[市区區县縣])?${PLACE}{1,5}${ROAD}` +
        `(?:${SP}${NUM}${SP}[段巷弄])*${SP}${NUM}${SP}[号號](?:院)?` +
        `${BUILDING}?${FLOOR}?${UNIT}?${ROOM}?`,
      'g',
    ),
  },
  // 小區地址：XX小区 5 栋 1 单元 302
  { name: '地址', pattern: new RegExp(`${PLACE}{1,8}?${COMPOUND}${BUILDING}${UNIT}?${ROOM}?`, 'g') },
  // 沒寫小區名，但有棟＋房號：5 栋 302、3 号楼 2 单元 501
  { name: '地址', pattern: new RegExp(`(?<![0-9０-９])${BUILDING_CORE}${UNIT}?${ROOM}`, 'g') },
]

/** 規則先擋（07C C2 第 1 點）：純函式，把個資換成 MASK。 */
export function maskByRules(text: string): MaskResult {
  return RULES.reduce<MaskResult>(
    (acc, rule) => {
      const masked = acc.text.replace(rule.pattern, MASK)
      if (masked === acc.text) return acc
      const hits = acc.hits.includes(rule.name) ? acc.hits : [...acc.hits, rule.name]
      return { text: masked, hits }
    },
    { text, hits: [] },
  )
}

export interface GuardDeps {
  getShareableProfile(userId: string): Promise<ShareableProfile | null>
  llmJson<T>(opts: LlmJsonOptions<T>): Promise<T>
  writeLog(entry: AgentLogInput): Promise<void>
}

export type GuardTextFn = (text: string, ownerUserId: string) => Promise<GuardResult>

const GUARD_TEMPERATURE = 0

function hitsToIssues(hits: readonly string[]): string[] {
  return hits.map((hit) => `包含${hit}`)
}

function unique(items: readonly string[]): string[] {
  return [...new Set(items)]
}

async function checkWithLlm(
  deps: GuardDeps,
  shareable: ShareableProfile | null,
  maskedText: string,
): Promise<GuardLlmResult> {
  return deps.llmJson({
    role: 'fast',
    system: renderGuardSystem({ shareable }),
    messages: [{ role: 'user', content: renderGuardUserMessage(maskedText) }],
    temperature: GUARD_TEMPERATURE,
    schema: guardResultSchema,
  })
}

/** 合併規則與 LLM 的結果；LLM 的改寫版再過一次規則，避免改寫時又帶出個資。 */
function combine(original: string, rules: MaskResult, llm: GuardLlmResult): GuardResult {
  const ruleIssues = hitsToIssues(rules.hits)
  if (llm.ok) {
    return rules.hits.length === 0
      ? { ok: true, text: original, issues: [] }
      : { ok: false, text: rules.text, issues: ruleIssues }
  }
  const remasked = maskByRules(llm.rewritten?.trim() || GUARD_FALLBACK)
  const llmIssues = llm.issues.length > 0 ? llm.issues : [LLM_DEFAULT_ISSUE]
  return { ok: false, text: remasked.text, issues: unique([...ruleIssues, ...llmIssues, ...hitsToIssues(remasked.hits)]) }
}

function describeError(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err)
}

type RecheckOutcome = 'passed' | 'fallback' | 'skipped'

interface RecheckResult {
  result: GuardResult
  recheck: RecheckOutcome
  error?: string
}

/**
 * LLM 改寫過的版本再檢查一次：同一句每次跑結果不同，實測偶爾會把時間地點原樣留在改寫版裡。
 * 第二次仍判洩漏、或檢查失敗 → 保守換成 GUARD_FALLBACK。
 */
async function recheckRewrite(
  deps: GuardDeps,
  shareable: ShareableProfile | null,
  result: GuardResult,
): Promise<RecheckResult> {
  if (result.text === GUARD_FALLBACK) return { result, recheck: 'skipped' }
  const fallback = { ...result, text: GUARD_FALLBACK }
  try {
    const second = await checkWithLlm(deps, shareable, result.text)
    return second.ok ? { result, recheck: 'passed' } : { result: fallback, recheck: 'fallback' }
  } catch (err) {
    return { result: fallback, recheck: 'fallback', error: describeError(err) }
  }
}

export function createGuardText(deps: GuardDeps): GuardTextFn {
  return async function guardText(text, ownerUserId) {
    if (text.trim() === '') return { ok: true, text, issues: [] }

    // 1. 規則先擋；交給 LLM 的也是遮蔽後的版本，個資不送出去
    const rules = maskByRules(text)
    const base = { user_id: ownerUserId, agent: 'guard' as const }

    // 2. 再用 LLM 檢查；4. 失敗時保守處理，只送出規則處理後的版本
    let llm: GuardLlmResult
    let shareable: ShareableProfile | null
    try {
      shareable = await deps.getShareableProfile(ownerUserId)
      llm = await checkWithLlm(deps, shareable, rules.text)
    } catch (err) {
      const issues = hitsToIssues(rules.hits)
      await deps.writeLog({
        ...base,
        action: '隐私检查失败',
        reason: `隐私检查暂时不可用，只发出规则处理后的版本${issues.length > 0 ? `（${issues.join('、')}）` : ''}`,
        detail: { error: describeError(err), rule_hits: rules.hits },
      })
      return { ok: rules.hits.length === 0, text: rules.text, issues }
    }

    // 3. 有改寫時寫日誌（不記原文，避免日誌裡留下個資）；LLM 改寫過的版本再檢查一次
    const combined = combine(text, rules, llm)
    if (combined.ok) return combined
    const checked: RecheckResult = llm.ok
      ? { result: combined, recheck: 'skipped' }
      : await recheckRewrite(deps, shareable, combined)
    await deps.writeLog({
      ...base,
      action: '改写分身消息',
      reason: checked.result.issues.join('、'),
      detail: {
        rule_hits: rules.hits,
        rewritten_by_llm: !llm.ok,
        recheck: checked.recheck,
        ...(checked.error ? { recheck_error: checked.error } : {}),
      },
    })
    return checked.result
  }
}

/** 預設依賴：A 的 contracts、B 的 llm／log。 */
export function defaultGuardDeps(): GuardDeps {
  return { getShareableProfile, llmJson, writeLog }
}

/** server/contracts/twin.ts 的 guardText 呼叫這個。 */
export const guardText: GuardTextFn = (text, ownerUserId) => createGuardText(defaultGuardDeps())(text, ownerUserId)
