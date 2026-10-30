// 呼叫模型平台的薄封裝。測試時用 setLlmClient() 換成假的，不會真的打 API。
import OpenAI from 'openai'
import { CONFIG } from '../config'
import { llmEnv } from './env'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LlmClient {
  chat(req: { model: string; messages: ChatMessage[]; temperature?: number; jsonMode: boolean }): Promise<string>
  embed(req: { model: string; input: string; dimensions: number }): Promise<number[]>
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

  async function complete(model: string, messages: ChatMessage[], temperature: number | undefined, json: boolean) {
    const res = await sdk.chat.completions.create({
      model,
      messages,
      temperature,
      ...(json ? { response_format: { type: 'json_object' as const } } : {}),
    })
    return res.choices[0]?.message?.content ?? ''
  }

  return {
    async chat({ model, messages, temperature, jsonMode }) {
      const useJson = jsonMode && jsonModeSupported
      try {
        return await complete(model, messages, temperature, useJson)
      } catch (err) {
        // 平台不支援 json_object 時會回 400：記住後改成一般模式，由上層擷取 JSON
        if (useJson && err instanceof OpenAI.APIError && err.status === 400) {
          jsonModeSupported = false
          return complete(model, messages, temperature, false)
        }
        throw err
      }
    },
    async embed({ model, input, dimensions }) {
      const res = await sdk.embeddings.create({ model, input, dimensions })
      return res.data[0]?.embedding ?? []
    },
  }
}
