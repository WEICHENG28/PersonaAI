import { z } from 'zod'

/**
 * Environment access layer — the only place that reads process.env.
 * Values are validated with zod; a missing variable produces an error that
 * names exactly what is missing (07 §2: 啟動時檢查必要變數).
 */

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
})

const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  LLM_BASE_URL: z.string().url(),
  LLM_API_KEY: z.string().min(1),
  MODEL_CHAT: z.string().min(1),
  MODEL_REASON: z.string().min(1),
  MODEL_FAST: z.string().min(1),
  MODEL_EMBED: z.string().min(1),
  EMBEDDING_DIM: z.coerce.number().int().positive(),
})

function formatMissing(error: z.ZodError): string {
  const missing = error.issues.map((issue) => issue.path.join('.'))
  return `缺少或無效的環境變數：${missing.join('、')}。請對照 .env.example 設定 .env.local。`
}

/** Public vars — safe in middleware and browser bundles. */
export function getPublicEnv(): { supabaseUrl: string; supabaseAnonKey: string } {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  })
  if (!parsed.success) {
    throw new Error(formatMissing(parsed.error))
  }
  return {
    supabaseUrl: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }
}

/** Full server-side vars — API routes, server components, worker, seed. */
export function getServerEnv(): {
  supabaseUrl: string
  supabaseAnonKey: string
  supabaseServiceRoleKey: string
  llmBaseUrl: string
  llmApiKey: string
  models: { chat: string; reason: string; fast: string; embed: string }
  embeddingDim: number
} {
  const parsed = serverEnvSchema.safeParse(process.env)
  if (!parsed.success) {
    throw new Error(formatMissing(parsed.error))
  }
  const env = parsed.data
  return {
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    llmBaseUrl: env.LLM_BASE_URL,
    llmApiKey: env.LLM_API_KEY,
    models: {
      chat: env.MODEL_CHAT,
      reason: env.MODEL_REASON,
      fast: env.MODEL_FAST,
      embed: env.MODEL_EMBED,
    },
    embeddingDim: env.EMBEDDING_DIM,
  }
}
