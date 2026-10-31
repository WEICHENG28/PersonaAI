import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Vercel 把 server/、shared/、api/ 編成 Node ESM 執行，相對路徑的 import 一定要寫副檔名（'./x.js'），
 * 否則上線後整個 /api 會 FUNCTION_INVOCATION_FAILED（2026-10-31 實際發生過）。本機的 tsx／vitest 不會報錯，所以用這個測試擋。
 */
function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? tsFiles(p) : /\.ts$/.test(name) && !/\.d\.ts$/.test(name) ? [p] : []
  })
}

describe('後端相對 import 都有 .js 副檔名（Vercel 需要）', () => {
  it('server／shared／api', () => {
    const bad: string[] = []
    for (const file of ['server', 'shared', 'api'].flatMap(tsFiles)) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|^\s*import\s+)(['"])(\.{1,2}\/[^'"]+)\1/gm)) {
        if (!/\.(js|mjs|cjs|json)$/.test(m[2]!)) bad.push(`${file}: ${m[2]}`)
      }
    }
    expect(bad, '請把這些 import 改成 .js 結尾（例如 "./app" → "./app.js"）').toEqual([])
  })
})
