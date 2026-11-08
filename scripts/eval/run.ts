// E-3 評測執行器（會真的呼叫模型平台、用到額度：只有人可以執行）。
// 用法：npx tsx scripts/eval/run.ts --suite memory,profile,friend,twin --label baseline [--repeat 2]
//       [--model-chat X --model-fast Y --model-reason Z --judge-model W]
// 輸出：.local/eval/<label>-<時間>/ 的 results.jsonl、summary.md、config.json（只有模型名，沒有金鑰、網址）。
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { EvalRow, EvalSuite } from './report.js'

export const HELP = `用法：npx tsx scripts/eval/run.ts --suite memory,profile,friend,twin --label <名字> [选项]
  --suite         要跑的题组，逗号分隔（默认四个都跑）
  --label         这次评测的名字，例如 baseline、n1（必填）
  --repeat        每题跑几次（默认 1）
  --model-chat    覆盖 MODEL_CHAT（阿澈、分身）
  --model-fast    覆盖 MODEL_FAST（记忆）
  --model-reason  覆盖 MODEL_REASON（档案）
  --judge-model   评审用的模型（默认用 MODEL_REASON）
注意：会真的调用模型平台、用到额度；读 .env.local 的 LLM_* 设定，不会印出金钥或网址。`

const SUITES: EvalSuite[] = ['memory', 'profile', 'friend', 'twin']

export interface RunArgs {
  suites: EvalSuite[]
  label: string
  repeat: number
  models: { chat?: string; fast?: string; reason?: string; judge?: string }
}

export function parseArgs(argv: string[]): RunArgs | 'help' {
  if (argv.includes('--help') || argv.includes('-h')) return 'help'
  const get = (flag: string) => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const suites = (get('--suite') ?? SUITES.join(',')).split(',').map(s => s.trim()).filter(Boolean)
  const bad = suites.filter(s => !SUITES.includes(s as EvalSuite))
  if (bad.length) throw new Error(`不认识的题组：${bad.join('、')}`)
  const label = get('--label')
  if (!label || !/^[\w.-]+$/.test(label)) throw new Error('--label 必填，只能用英文、数字、点、底线、减号')
  const repeat = Number(get('--repeat') ?? 1)
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 5) throw new Error('--repeat 要是 1–5 的整数')
  return {
    suites: suites as EvalSuite[],
    label,
    repeat,
    models: { chat: get('--model-chat'), fast: get('--model-fast'), reason: get('--model-reason'), judge: get('--judge-model') },
  }
}

export function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

/** 錯誤訊息可能帶平台回應：存檔、印出前把金鑰、網址、主機名換掉。 */
export function redactSecrets(text: string, env: NodeJS.ProcessEnv = process.env): string {
  const secrets: string[] = []
  if (env.LLM_API_KEY) secrets.push(env.LLM_API_KEY)
  if (env.LLM_BASE_URL) {
    secrets.push(env.LLM_BASE_URL)
    try {
      secrets.push(new URL(env.LLM_BASE_URL).host)
    } catch {
      /* 網址格式不對就只換整串 */
    }
  }
  return secrets.filter(s => s.length >= 4).sort((a, b) => b.length - a.length).reduce((out, s) => out.split(s).join('[redacted]'), text)
}

type Partial = Omit<EvalRow, 'repeat' | 'model' | 'ttftMs' | 'totalMs' | 'completionTokens' | 'llmCalls'>

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv)
  if (args === 'help') {
    console.log(HELP)
    return
  }
  if (existsSync('.env.local')) process.loadEnvFile('.env.local')
  // 一定要在第一次載入 server/lib/llm 之前設好（模型名稱第一次用到就會被記住）
  if (args.models.chat) process.env.MODEL_CHAT = args.models.chat
  if (args.models.fast) process.env.MODEL_FAST = args.models.fast
  if (args.models.reason) process.env.MODEL_REASON = args.models.reason
  process.env.LLM_METRICS_LOG = '0'

  const { setLlmMetricSink, llmJson } = await import('../../server/lib/llm/index.js')
  const { modelFor } = await import('../../server/lib/llm/env.js')
  const { generateFriendReply } = await import('../../server/friend/reply.js')
  const { extractMemoryCandidates } = await import('../../server/friend/memory.js')
  const { extractProfileCandidates, dropNegatedInterests } = await import('../../server/friend/profile.js')
  const { ACHE, getLifeUpdate, pickNextEvent } = await import('../../server/friend/persona.js')
  const { createTwinReply } = await import('../../server/twin/twin.js')
  const { CLOSING_INSTRUCTION } = await import('../../server/twin/conversation.js')
  const { maskByRules } = await import('../../src/lib/privacy/rules.js')
  const { loadScenarios } = await import('./scenario.js')
  const { judgeReply, judgeMemory } = await import('./judge.js')
  const { summarize, buildConfig } = await import('./report.js')
  const suites = await import('./suites.js')

  const judgeModel = args.models.judge
  const judge = (input: Parameters<typeof judgeReply>[0]) => judgeReply(input, { model: judgeModel })
  const metrics: { tag: string; totalMs: number; ttftMs: number | null; completionTokens: number | null }[] = []
  setLlmMetricSink(m => { metrics.push(m) })

  const startedAt = new Date().toISOString()
  const outDir = resolve('.local/eval', `${args.label}-${stamp()}`)
  await mkdir(outDir, { recursive: true })
  const rows: EvalRow[] = []
  const all = (await loadScenarios()).filter(s => args.suites.includes(s.kind))
  const life = getLifeUpdate(0)
  const base = { lifeState: `${life.mood}；${life.doing}`, eventText: pickNextEvent(0, [])?.line ?? null }
  const persona = `${ACHE.name}：${ACHE.traits.join('、')}；说话方式：${ACHE.speech}`

  /** 跑一題，量出這題（不含評審）的 LLM 次數、時間、tokens。 */
  async function measured(suite: EvalSuite, scenarioId: string, repeat: number, model: string, run: () => Promise<Partial | Partial[]>) {
    const from = metrics.length
    const t0 = performance.now()
    try {
      const out = await run()
      const used = metrics.slice(from).filter(m => !m.tag.startsWith('eval.'))
      const list = Array.isArray(out) ? out : [out]
      for (const r of list) {
        rows.push({
          ...r, repeat, model,
          ttftMs: used.find(m => m.ttftMs !== null)?.ttftMs ?? null,
          totalMs: Math.round(used.reduce((s, m) => s + m.totalMs, 0) / list.length),
          completionTokens: used.some(m => m.completionTokens !== null) ? Math.round(used.reduce((s, m) => s + (m.completionTokens ?? 0), 0) / list.length) : null,
          llmCalls: used.length / list.length,
        })
      }
    } catch (err) {
      const llmCalls = metrics.slice(from).filter(m => !m.tag.startsWith('eval.')).length
      rows.push({ suite, scenarioId, repeat, model, output: '', pass: null, ttftMs: null, totalMs: Math.round(performance.now() - t0), completionTokens: null, llmCalls, error: redactSecrets(err instanceof Error ? err.message : String(err)).slice(0, 200) })
    }
    console.log(`[eval] ${suite}/${scenarioId}#${repeat} ${rows.at(-1)?.error ? '出错' : '完成'}`)
  }

  for (let repeat = 1; repeat <= args.repeat; repeat++) {
    for (const s of all) {
      if (s.kind === 'memory') {
        await measured('memory', s.id, repeat, modelFor('fast'), async () => {
          const memories = (await extractMemoryCandidates({
            userText: s.userText,
            recent: s.recent.map(line => (line.startsWith('阿澈：') ? { role: 'friend', content: line.slice(3) } : { role: 'user', content: line.replace(/^用户：/, '') })),
            existing: s.existing,
          })).map(m => m.content)
          const ruleFail = suites.checkMemoryRules(memories, s.expect)
          const semantic = await judgeMemory({ userText: s.userText, memories }, { model: judgeModel })
          const failReason = ruleFail ?? (semantic.wrong ? `评审认为记错：${semantic.reason}` : undefined)
          return { suite: 'memory', scenarioId: s.id, output: JSON.stringify(memories), context: s.userText, pass: !failReason, failReason }
        })
      } else if (s.kind === 'profile') {
        await measured('profile', s.id, repeat, modelFor('reason'), async () => {
          const out = await extractProfileCandidates({ userLines: s.userLines })
          // 和正式流程一樣：模型給的興趣再過一次否定過濾
          const interests = dropNegatedInterests(out.shareable_profile.interests, s.userLines)
          const failReason = suites.checkProfileInterests(interests, s.expect) ?? undefined
          return { suite: 'profile', scenarioId: s.id, output: JSON.stringify(interests), context: s.userLines.join('\n'), pass: !failReason, failReason }
        })
      } else if (s.kind === 'friend') {
        await measured('friend', s.id, repeat, modelFor('chat'), () =>
          suites.runFriendScenario(s, { generate: ctx => generateFriendReply(ctx), judge, persona, base, copyRefs: [] }))
      } else {
        await measured('twin', s.id, repeat, modelFor('chat'), () => {
          const store = suites.memoryTwinStore(s)
          const profiles = suites.twinProfiles(s)
          const reply = createTwinReply({
            store,
            getShareableProfile: async id => profiles.shareable(id),
            getStyleProfile: async id => profiles.style(id),
            // 守門只套規則，不另外呼叫模型（評的是分身本身）
            guardText: async t => ({ ok: true, text: maskByRules(t).text, issues: [] }),
            llmJson,
            writeLog: async () => {},
          })
          return suites.runTwinScenario(s, { reply, store, judge, closingInstruction: CLOSING_INSTRUCTION })
        })
      }
    }
  }
  setLlmMetricSink(null)

  const models = { chat: modelFor('chat'), fast: modelFor('fast'), reason: modelFor('reason'), judge: judgeModel ?? modelFor('reason') }
  await writeFile(join(outDir, 'results.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf-8')
  await writeFile(join(outDir, 'summary.md'), `# 评测：${args.label}\n\n${summarize(rows)}\n`, 'utf-8')
  await writeFile(join(outDir, 'config.json'), JSON.stringify(buildConfig({ label: args.label, suites: args.suites, repeat: args.repeat, models, startedAt }), null, 2), 'utf-8')
  console.log(`\n完成，结果在 ${outDir}\n`)
  console.log(summarize(rows))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(err => {
    console.error(redactSecrets(err instanceof Error ? err.message : String(err)))
    process.exitCode = 1
  })
}
