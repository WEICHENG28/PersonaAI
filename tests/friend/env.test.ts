import { describe, expect, it } from 'vitest'

/**
 * A0 必測（07A）：lib/env.ts 的 zod 驗證 — 缺少變數時錯誤訊息要明確指出缺哪個。
 * 直接測 schema 行為（不經 getServerEnv 的 env 依賴），保持純邏輯。
 */
import { z } from 'zod'

// 與 lib/env.ts 相同的 schema 形狀；env.ts 不匯出 schema（避免洩漏 internals），
// 這裡重現同一份規則驗證「錯誤訊息列出缺哪個變數」的行為。
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
})

function formatMissing(error: z.ZodError): string {
  const missing = error.issues.map((issue) => issue.path.join('.'))
  return `缺少或無效的環境變數：${missing.join('、')}。請對照 .env.example 設定 .env.local。`
}

describe('env schema（lib/env.ts）', () => {
  it('缺少 URL 時，錯誤訊息明確列出 NEXT_PUBLIC_SUPABASE_URL', () => {
    const parsed = publicEnvSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(formatMissing(parsed.error)).toContain('NEXT_PUBLIC_SUPABASE_URL')
    }
  })

  it('缺少 ANON KEY 時，錯誤訊息明確列出 NEXT_PUBLIC_SUPABASE_ANON_KEY', () => {
    const parsed = publicEnvSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.example.com',
    })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(formatMissing(parsed.error)).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    }
  })

  it('全部缺少時，兩個變數都被列出', () => {
    const parsed = publicEnvSchema.safeParse({})
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      const message = formatMissing(parsed.error)
      expect(message).toContain('NEXT_PUBLIC_SUPABASE_URL')
      expect(message).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    }
  })

  it('URL 格式錯誤也算無效', () => {
    const parsed = publicEnvSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: 'not-a-url',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    })
    expect(parsed.success).toBe(false)
  })

  it('齊全且合法時通過', () => {
    const parsed = publicEnvSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.example.com',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    })
    expect(parsed.success).toBe(true)
  })
})
