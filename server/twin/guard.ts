// C2 隱私守門（docs/07C C2）。擁有者：C。
// guardText：先用規則遮蔽個資（maskByRules），再用 Prompt 13 檢查；LLM 改寫過的版本再檢查一次，不過就換成 GUARD_FALLBACK。
// 有改寫就寫日誌。第一次 LLM 檢查失敗時只送出規則處理後的版本。
// 規則與 maskByRules 在 src/lib/privacy/rules.ts（前端送出前警告也用同一套）。
// MASK、hits、issues、日誌會出現在畫面和工作日誌上，所以用簡體中文。
import type { AgentLogInput, GuardResult, ShareableProfile } from '../../shared/types.js'
import { getShareableProfile } from '../contracts/friend.js'
import { llmJson, type LlmJsonOptions } from '../lib/llm/index.js'
import { writeLog } from '../lib/log.js'
import { maskByRules, type MaskResult } from '../../src/lib/privacy/rules.js'
import { guardResultSchema, renderGuardSystem, renderGuardUserMessage, type GuardLlmResult } from '../prompts/13_guard.js'

export { MASK, maskByRules, type MaskResult } from '../../src/lib/privacy/rules.js'

/** Prompt 13：LLM 判定洩漏卻沒給改寫版時用。 */
export const GUARD_FALLBACK = '这个我之后再跟你说'
const LLM_DEFAULT_ISSUE = '可能泄露隐私'

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
