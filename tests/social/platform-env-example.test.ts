import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
it('documents school model defaults and leaves credentials blank', () => {
  const source = readFileSync(new URL('../../.env.example', import.meta.url), 'utf-8')
  const values = Object.fromEntries(source.split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => {
    const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]
  }))
  expect(values).toMatchObject({ MODEL_CHAT: 'Kimi-K2.6', MODEL_REASON: 'Qwen3.8-Max', MODEL_FAST: 'Qwen3.8-Flash',
    MODEL_EMBED: 'GLM-Embedding-3', EMBEDDING_DIM: '1024', LLM_API_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '', ADMIN_SECRET: '' })
  expect(JSON.parse(values.LLM_MODEL_PARAMS!)).toEqual({ 'Qwen3.8-Max': { thinking: { type: 'disabled' } }, 'Qwen3.8-Flash': { thinking: { type: 'disabled' } } })
})
