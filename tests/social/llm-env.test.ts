import { afterEach, expect, it, vi } from 'vitest'
import { modelParamsFor } from '../../server/lib/llm/env.js'
import { worstCaseMs } from '../../server/lib/llm/index.js'
afterEach(() => vi.unstubAllEnvs())
it('matches exact names before the longest prefix and supports disabled thinking', () => {
  vi.stubEnv('LLM_MODEL_PARAMS', JSON.stringify({ 'Qwen*': { a: 1 }, 'Qwen3*': { thinking: { type: 'disabled' } }, 'Qwen3.8-Max': { b: 2 } }))
  expect(modelParamsFor('Qwen3.8-Flash')).toEqual({ thinking: { type: 'disabled' } })
  expect(modelParamsFor('Qwen3.8-Max')).toEqual({ b: 2 })
  expect(modelParamsFor('Kimi-K2.6')).toEqual({})
})
it.each(['{', '[]', 'null', '{"Qwen*":false}'])('rejects invalid configuration %s', value => {
  vi.stubEnv('LLM_MODEL_PARAMS', value)
  expect(() => modelParamsFor('Qwen')).toThrow('LLM_MODEL_PARAMS 不是有效的 JSON 对象')
})
it('does not add model parameters when unset', () => {
  vi.stubEnv('LLM_MODEL_PARAMS', '')
  expect(modelParamsFor('Qwen3.8-Flash')).toEqual({})
})
it('calculates foreground and background retry budgets', () => {
  expect(worstCaseMs({ timeoutMs: 20000, maxAttempts: 2, backoffMs: 800 })).toBe(40800)
  expect(worstCaseMs({ timeoutMs: 25000, maxAttempts: 2, backoffMs: 800 })).toBeLessThan(55000)
})
