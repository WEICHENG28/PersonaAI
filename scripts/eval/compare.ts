// E-3 盲測對照：把兩次評測（例如 baseline 和 n1）同一題的回覆配對、隨機排順序，產生給人標記的 CSV。
// 用法：npx tsx scripts/eval/compare.ts .local/eval/baseline-xxxx .local/eval/n1-xxxx [--seed 1]
// 輸出：第二個資料夾裡的 blind-pairs.csv（pick 欄填 1 或 2）和 blind-key.json（標完再看，A＝第一個資料夾）。
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { toBlindPairs, type EvalRow } from './report.js'

export function parseRows(jsonl: string): EvalRow[] {
  return jsonl.split('\n').filter(l => l.trim()).map(l => JSON.parse(l) as EvalRow)
}

/** 標完的 CSV＋答案 → 新版（B）勝率。pick 是 1 或 2，其他（平手、空白）不算。 */
export function winRate(picks: { pairId: string; pick: string }[], key: Record<string, 'A' | 'B'>): { bWins: number; total: number; rate: number | null } {
  let bWins = 0
  let total = 0
  for (const { pairId, pick } of picks) {
    const first = key[pairId]
    if (!first || (pick !== '1' && pick !== '2')) continue
    total++
    const chosen = pick === '1' ? first : first === 'A' ? 'B' : 'A'
    if (chosen === 'B') bWins++
  }
  return { bWins, total, rate: total ? bWins / total : null }
}

async function main(argv = process.argv.slice(2)) {
  const [dirA, dirB] = argv.filter(a => !a.startsWith('--'))
  if (!dirA || !dirB) {
    console.log('用法：npx tsx scripts/eval/compare.ts <旧版资料夹> <新版资料夹> [--seed 1]')
    return
  }
  const seedIndex = argv.indexOf('--seed')
  const seed = seedIndex >= 0 ? Number(argv[seedIndex + 1]) : 1
  const a = parseRows(await readFile(join(resolve(dirA), 'results.jsonl'), 'utf-8'))
  const b = parseRows(await readFile(join(resolve(dirB), 'results.jsonl'), 'utf-8'))
  const { csv, key } = toBlindPairs(a, b, seed)
  await writeFile(join(resolve(dirB), 'blind-pairs.csv'), '﻿' + csv, 'utf-8')
  await writeFile(join(resolve(dirB), 'blind-key.json'), JSON.stringify({ A: dirA, B: dirB, seed, key }, null, 2), 'utf-8')
  console.log(`已产生 ${Object.keys(key).length} 对，档案在 ${resolve(dirB)}（先标 blind-pairs.csv，再看 blind-key.json）`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(err => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
}
