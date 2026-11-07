import OpenAI from 'openai'
import type { ModelRole } from '../../../shared/types.js'

export type LlmFailure = 'http_401' | 'http_403' | 'http_429' | 'http_4xx' | 'http_5xx' | 'timeout' | 'network' | 'empty' | 'schema' | 'dimension' | 'unknown'

export function classifyFailure(error: unknown): LlmFailure {
  if (OpenAI.APIConnectionTimeoutError && error instanceof OpenAI.APIConnectionTimeoutError) return 'timeout'
  if (OpenAI.APIConnectionError && error instanceof OpenAI.APIConnectionError) return 'network'
  const e = error as { status?: number; name?: string; code?: string } | null
  if (e?.status === 401) return 'http_401'
  if (e?.status === 403) return 'http_403'
  if (e?.status === 429) return 'http_429'
  if (e?.status && e.status >= 400 && e.status < 500) return 'http_4xx'
  if (e?.status && e.status >= 500 && e.status < 600) return 'http_5xx'
  if (['APIConnectionTimeoutError', 'AbortError', 'TimeoutError'].includes(e?.name ?? '') || e?.code === 'ETIMEDOUT') return 'timeout'
  if (e?.name === 'APIConnectionError' || ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND'].includes(e?.code ?? '')) return 'network'
  return 'unknown'
}

export interface LlmMetric {
  tag: string
  role: ModelRole | 'embed'
  model: string
  lane: 'fg' | 'bg'
  stream: boolean
  ok: boolean
  attempts: number
  queueMs: number
  ttftMs: number | null
  totalMs: number
  promptTokens: number | null
  completionTokens: number | null
  error?: LlmFailure
}

type MetricSink = (metric: LlmMetric) => void
export type LlmMetricState = Pick<LlmMetric, 'model' | 'attempts' | 'queueMs' | 'promptTokens' | 'completionTokens'> & { error?: LlmFailure }
let sink: MetricSink | null = null

/** null 恢复默认 console 输出；显式收集器不受 console 日志开关影响。 */
export function setLlmMetricSink(next: MetricSink | null): void {
  sink = next
}

function deliver(receiver: MetricSink, metric: LlmMetric): void {
  try {
    // 独立副本避免某个观察者改动另一个观察者看到的指标。
    void Promise.resolve(receiver({ ...metric })).catch(() => console.warn('LLM 指标接收失败'))
  } catch {
    console.warn('LLM 指标接收失败')
  }
}

export function emitLlmMetric(metric: LlmMetric): void {
  if (sink) deliver(sink, metric)
  else if (process.env.LLM_METRICS_LOG !== '0') {
    deliver(value => console.log(JSON.stringify({ type: 'llm_metric', ...value })), metric)
  }
}

/** 一次逻辑调用一笔，包含所有上层重试、排队及退避时间；不记录模型原文或平台错误。 */
export async function withLlmMetric<T>(
  opts: { role: LlmMetric['role']; tag: string; onMetric?: MetricSink },
  run: (state: LlmMetricState) => Promise<T>,
): Promise<T> {
  const started = performance.now()
  const state: LlmMetricState = { model: 'unknown', attempts: 0, queueMs: 0,
    promptTokens: null, completionTokens: null }
  let ok = false
  try {
    const value = await run(state)
    ok = true
    return value
  } finally {
    const { error, ...values } = state
    const metric: LlmMetric = { ...values, queueMs: Math.round(state.queueMs), role: opts.role, tag: opts.tag,
      lane: 'fg', stream: false, ok, ttftMs: null, totalMs: Math.round(performance.now() - started),
      ...(!ok ? { error: error ?? 'unknown' } : {}) }
    emitLlmMetric(metric)
    if (opts.onMetric) deliver(opts.onMetric, metric)
  }
}
