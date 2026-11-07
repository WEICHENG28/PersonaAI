// 呼叫模型平台的薄封裝。測試時用 setLlmClient() 換成假的，不會真的打 API。
import OpenAI from 'openai'
import { CONFIG } from '../config.js'
import { llmEnv } from './env.js'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LlmChatResult {
  content: string
  usage?: { promptTokens: number | null; completionTokens: number | null }
}

export interface LlmEmbedResult {
  vector: number[]
  usage?: { promptTokens: number | null }
}

export function normalizeChatResult(value: string | LlmChatResult): LlmChatResult {
  return typeof value === 'string' ? { content: value } : value
}

export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  temperature?: number
  jsonMode: boolean
  maxTokens?: number
  extraBody?: Record<string, unknown>
  timeoutMs?: number
}

export interface LlmClient {
  chat(req: ChatRequest): Promise<string | LlmChatResult>
  embed(req: { model: string; input: string; dimensions: number }): Promise<number[] | LlmEmbedResult>
}

let override: LlmClient | null = null
let real: LlmClient | null = null

/** 測試用：傳 null 還原成真的平台。 */
export function setLlmClient(client: LlmClient | null): void {
  override = client
}

export function getLlmClient(): LlmClient {
  if (override) return override
  real ??= createOpenAiClient()
  return real
}

function createOpenAiClient(): LlmClient {
  const env = llmEnv()
  // 重試由 server/lib/llm 自己控制，所以 SDK 的 maxRetries 設 0
  const sdk = new OpenAI({
    baseURL: env.LLM_BASE_URL,
    apiKey: env.LLM_API_KEY,
    timeout: CONFIG.LLM_TIMEOUT_MS,
    maxRetries: 0,
  })
  let jsonModeSupported = true

  async function complete(model: string, messages: ChatMessage[], temperature: number | undefined, json: boolean, req: ChatRequest) {
    const res = await sdk.chat.completions.create({
      ...req.extraBody,
      model,
      messages,
      temperature,
      ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
      ...(json ? { response_format: { type: 'json_object' as const } } : {}),
    }, { timeout: req.timeoutMs })
    return { content: res.choices[0]?.message?.content ?? '',
      ...(res.usage ? { usage: { promptTokens: res.usage.prompt_tokens ?? null,
        completionTokens: res.usage.completion_tokens ?? null } } : {}) }
  }

  return {
    async chat(req) {
      const { model, messages, temperature, jsonMode } = req
      const started = performance.now()
      const budget = req.timeoutMs ?? CONFIG.LLM_TIMEOUT_MS
      const useJson = jsonMode && jsonModeSupported
      try {
        return await complete(model, messages, temperature, useJson, req)
      } catch (err) {
        // 平台不支援 json_object 時會回 400：記住後改成一般模式，由上層擷取 JSON
        if (useJson && err instanceof OpenAI.APIError && err.status === 400) {
          jsonModeSupported = false
          const remaining = Math.floor(budget - (performance.now() - started))
          if (remaining <= 0) {
            const timeout = new Error('模型调用超时')
            timeout.name = 'TimeoutError'
            throw timeout
          }
          return complete(model, messages, temperature, false, { ...req, timeoutMs: remaining })
        }
        throw err
      }
    },
    async embed({ model, input, dimensions }) {
      const res = await sdk.embeddings.create({ model, input, dimensions })
      return { vector: res.data[0]?.embedding ?? [],
        ...(res.usage ? { usage: { promptTokens: res.usage.prompt_tokens ?? null } } : {}) }
    },
  }
}
