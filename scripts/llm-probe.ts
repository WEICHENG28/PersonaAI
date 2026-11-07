// P0-1：这是唯一直接 new OpenAI 的例外，用于独立探测平台能力，不接入产品调用路径。
import OpenAI from 'openai'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { THINKING_VARIANTS, redactError, summarizeProbe } from './probe/lib.js'
import type { ProbeResult, ProbeVariant } from './probe/lib.js'

export interface ProbeOptions {
  models: string[]
  embeds: string[]
  runs: number
  concurrency: number
}

const HELP = `用法：npx tsx scripts/llm-probe.ts --models a,b [--embed e,f] [--runs 3] [--concurrency 3]
--help          只显示帮助，不读取 .env.local，不调用 API
--models        聊天模型列表，逗号分隔
--embed         embedding 模型列表，逗号分隔；请求 dimensions:1024，记录实际维度
--runs          每组重复次数（1–100，默认 3）
--concurrency   同时执行的请求数（1–32，默认 3）
每个聊天模型 × 3 个变体 × runs 执行普通非串流、串流和 JSON 检查（共 9 × runs 个请求）。
每个 embedding 模型执行 runs 个请求。超时 30 秒，关闭自动重试；输出最多 256 tokens。
所有请求共享并发上限；不保存模型正文，只保存指标和已脱敏错误。
结果写入 .local/eval/probe-yyyyMMdd-HHmm.md。同一分钟重复运行会覆盖报告。
请由使用者手动配置 LLM_BASE_URL、LLM_API_KEY 后运行；会消耗平台额度。`

export function parseProbeArgs(args: string[]): ProbeOptions {
  const { values } = parseArgs({ args, options: {
    models: { type: 'string' }, embed: { type: 'string' },
    runs: { type: 'string', default: '3' }, concurrency: { type: 'string', default: '3' },
  } })
  const list = (s: string | undefined) => [...new Set((s ?? '').split(',').map(x => x.trim()).filter(Boolean))]
  const models = list(values.models)
  const embeds = list(values.embed)
  const runs = Number(values.runs)
  const concurrency = Number(values.concurrency)
  if (!models.length && !embeds.length) throw new Error('请指定 --models 或 --embed')
  if (!Number.isInteger(runs) || runs < 1 || runs > 100) throw new Error('--runs 必须为 1–100 的整数')
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
    throw new Error('--concurrency 必须为 1–32 的整数')
  }
  return { models, embeds, runs, concurrency }
}

interface Job {
  model: string
  mode: ProbeResult['mode']
  variant: ProbeVariant
  json: boolean
}

function jobsFor(opts: ProbeOptions): Job[] {
  const jobs: Job[] = []
  for (let run = 0; run < opts.runs; run++) {
    for (const model of opts.models) {
      for (const variant of Object.keys(THINKING_VARIANTS) as ProbeVariant[]) {
        jobs.push({ model, mode: 'nonstream', variant, json: false },
          { model, mode: 'stream', variant, json: false },
          { model, mode: 'nonstream', variant, json: true })
      }
    }
    for (const model of opts.embeds) jobs.push({ model, mode: 'embed', variant: 'default', json: false })
  }
  return jobs
}

type Reasoning = { reasoning_content?: string }
const requestOptions = () => ({ maxRetries: 0, timeout: 30_000, signal: AbortSignal.timeout(30_000) })

async function readStream(client: OpenAI, job: Job, row: ProbeResult, start: number, now: () => number) {
  const options = requestOptions()
  const stream = await client.chat.completions.create({
    model: job.model, messages: [{ role: 'user', content: '请用一句简短的中文打招呼。' }],
    ...THINKING_VARIANTS[job.variant], max_tokens: 256,
    stream: true, stream_options: { include_usage: true },
  }, options)
  let visible = false
  let finished = false
  for await (const chunk of stream) {
    if (chunk.choices[0]?.finish_reason) finished = true
    const delta = chunk.choices[0]?.delta as (Reasoning & { content?: string | null }) | undefined
    row.reasoningChars += delta?.reasoning_content?.length ?? 0
    if (delta?.content?.length && row.ttftMs === null) row.ttftMs = now() - start
    if (delta?.content?.trim()) visible = true
    row.completionTokens = chunk.usage?.completion_tokens ?? row.completionTokens
  }
  options.signal.throwIfAborted()
  if (!visible) throw new Error('串流没有返回正文')
  if (!finished) throw new Error('串流在完成标记之前结束')
}

async function readNonstream(client: OpenAI, job: Job, row: ProbeResult) {
  const response = await client.chat.completions.create({
    model: job.model, messages: [{ role: 'user', content: job.json
      ? '请只输出一个 JSON 对象：{"ok":true}。' : '请用一句简短的中文打招呼。' }],
    ...THINKING_VARIANTS[job.variant], max_tokens: 256, stream: false,
    ...(job.json ? { response_format: { type: 'json_object' as const } } : {}),
  }, requestOptions())
  const message = response.choices[0]?.message
  row.completionTokens = response.usage?.completion_tokens ?? null
  row.reasoningChars = (message as (Reasoning | undefined))?.reasoning_content?.length ?? 0
  if (job.json) {
    let value: unknown
    try { value = JSON.parse(message?.content ?? '') } catch { /* 统一记为 invalid，不保存原文 */ }
    const valid = value !== null && typeof value === 'object' && !Array.isArray(value)
    row.jsonObject = valid ? 'ok' : 'invalid'
    if (!valid) throw new Error('json_object 未返回有效 JSON 对象')
  } else if (!message?.content?.trim()) {
    throw new Error('非串流没有返回正文')
  }
}

async function measure(client: OpenAI, job: Job, secrets: string[], now: () => number): Promise<ProbeResult> {
  const start = now()
  const row: ProbeResult = {
    model: job.model, mode: job.mode, variant: job.variant, ok: false,
    ttftMs: null, totalMs: 0, completionTokens: null, reasoningChars: 0,
    jsonObject: 'skipped',
    requestKind: job.mode === 'embed' ? 'embed' : job.json ? 'json_object' : 'text',
  }
  try {
    if (job.mode === 'embed') {
      const response = await client.embeddings.create({
        model: job.model, input: '这是平台向量维度探测。', dimensions: 1024, encoding_format: 'float',
      }, requestOptions())
      const vector = response.data[0]?.embedding
      if (!Array.isArray(vector) || !vector.length || !vector.every(Number.isFinite)) {
        throw new Error('embedding 未返回有效向量')
      }
      row.embedDim = vector.length
    } else if (job.mode === 'stream') {
      await readStream(client, job, row, start, now)
    } else {
      await readNonstream(client, job, row)
    }
    row.ok = true
  } catch (error) {
    if (job.json && (error as { status?: number } | null)?.status === 400) row.jsonObject = 'rejected'
    row.error = redactError(error instanceof Error ? error.message : String(error), secrets)
  }
  row.totalMs = now() - start
  return row
}

export async function runProbe(
  opts: ProbeOptions, client: OpenAI, secrets: string[] = [], now: () => number = () => performance.now(),
): Promise<ProbeResult[]> {
  const jobs = jobsFor(opts)
  const rows = new Array<ProbeResult>(jobs.length)
  let next = 0
  const worker = async () => {
    while (next < jobs.length) {
      const index = next++
      rows[index] = await measure(client, jobs[index]!, secrets, now)
    }
  }
  await Promise.all(Array.from({ length: Math.min(opts.concurrency, jobs.length) }, worker))
  return rows
}

interface MainDeps {
  cwd?: string
  env?: NodeJS.ProcessEnv
  loadEnv?: () => void
  createClient?: (opts: ConstructorParameters<typeof OpenAI>[0]) => OpenAI
  print?: (text: string) => void
}

function reportStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}`
}

export async function main(args = process.argv.slice(2), deps: MainDeps = {}): Promise<void> {
  const print = deps.print ?? console.log
  if (args.includes('--help')) { print(HELP); return }
  const opts = parseProbeArgs(args)
  const cwd = deps.cwd ?? process.cwd()
  const loadEnv = deps.loadEnv ?? (() => {
    const path = join(cwd, '.env.local')
    if (existsSync(path)) process.loadEnvFile(path)
  })
  loadEnv()
  const env = deps.env ?? process.env
  const baseURL = env.LLM_BASE_URL
  const apiKey = env.LLM_API_KEY
  if (!baseURL || !apiKey) throw new Error('请先配置 LLM_BASE_URL 和 LLM_API_KEY')
  const secrets = [apiKey, baseURL]
  try {
    const client = (deps.createClient ?? (config => new OpenAI(config)))({
      baseURL, apiKey, maxRetries: 0, timeout: 30_000, logLevel: 'off',
    })
    const rows = await runProbe(opts, client, secrets)
    const report = redactError([
      `重复次数：${opts.runs}；请求并发上限：${opts.concurrency}；自动重试：0；超时：30000ms。`,
      summarizeProbe(rows),
    ].join('\n\n'), secrets)
    const directory = join(cwd, '.local', 'eval')
    await mkdir(directory, { recursive: true })
    const name = `probe-${reportStamp(new Date())}.md`
    await writeFile(join(directory, name), report, { encoding: 'utf-8' })
    print(`报告已保存：.local/eval/${name}`)
  } catch (error) {
    throw new Error(redactError(error instanceof Error ? error.message : String(error), secrets))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(`探测失败：${redactError(error instanceof Error ? error.message : String(error),
      [process.env.LLM_API_KEY ?? '', process.env.LLM_BASE_URL ?? ''])}`)
    process.exitCode = 1
  })
}
