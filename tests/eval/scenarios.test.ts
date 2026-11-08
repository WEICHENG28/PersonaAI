import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, basename } from 'node:path'
import { expect, it } from 'vitest'
import { loadScenarios, scenarioSchema } from '../../scripts/eval/scenario.js'
it('loads at least 46 unique, valid scenarios with required suite counts', async () => {
  const rows = await loadScenarios()
  expect(rows.length).toBeGreaterThanOrEqual(46)
  expect(new Set(rows.map(row => row.id)).size).toBe(rows.length)
  for (const row of rows) expect(scenarioSchema.safeParse(row).success).toBe(true)
  for (const [kind, count] of Object.entries({ memory: 16, profile: 4, friend: 20, twin: 6 })) {
    expect(rows.filter(row => row.kind === kind).length).toBeGreaterThanOrEqual(count)
  }
})
it('uses simplified synthetic content without long numbers', async () => {
  const text = JSON.stringify(await loadScenarios())
  expect(text).not.toMatch(/[們這說個為來對時會還沒於與樣裡]/)
  expect(text).not.toMatch(/\d{7,}/)
  expect(text).not.toMatch(/(?:路|街|巷).{0,8}\d+号/)
})
it('covers memory categories and all five requested negative sentence forms', async () => {
  const memory = (await loadScenarios()).filter(row => row.kind === 'memory')
  for (const [category, count] of Object.entries({ negation: 5, past: 3, other: 3, uncertain: 3, hypothetical: 2 })) {
    expect(memory.filter(row => row.id.startsWith(`memory-${category}-`)).length).toBeGreaterThanOrEqual(count)
  }
  const negatives = memory.filter(row => row.id.startsWith('memory-negation-'))
  for (const phrase of ['不喜欢昆虫', '对爬山没兴趣', '怕狗', '不吃辣', '不再熬夜']) {
    expect(negatives.some(row => row.userText.includes(phrase))).toBe(true)
  }
  expect(negatives.every(row => (row.expect.mustNotContain?.length ?? 0) > 0)).toBe(true)
  expect(memory.some(row => (row.expect.mustContain?.length ?? 0) > 0)).toBe(true)
})
it('covers friend categories including contextual agreement and twin long/emoji settings', async () => {
  const rows = await loadScenarios()
  const friend = rows.filter(row => row.kind === 'friend')
  for (const [tag, count] of Object.entries({ short: 4, emotion: 4, ask_friend: 3, sharing: 3, find_people: 3, closing: 3 })) {
    expect(friend.filter(row => row.tags.includes(tag)).length).toBeGreaterThanOrEqual(count)
  }
  expect(friend.some(row => row.userText === '好啊' && row.history.length > 0)).toBe(true)
  expect(rows.some(row => row.kind === 'twin' && [row.a, row.b].some(side => side.style.sentence_length === 'long' && side.style.emoji_level === 3))).toBe(true)
})
it('rejects malformed scenario kinds', () => {
  expect(scenarioSchema.safeParse({ id: 'bad', kind: 'unknown' }).success).toBe(false)
})

it('validates numeric limits and twin style values', async () => {
  const rows = await loadScenarios()
  const twin = rows.find(row => row.kind === 'twin')!
  expect(scenarioSchema.safeParse({ ...twin, turns: 0 }).success).toBe(false)
  expect(scenarioSchema.safeParse({ ...twin, a: { ...twin.a, style: { ...twin.a.style, emoji_level: 4 } } }).success).toBe(false)
  const memory = rows.find(row => row.kind === 'memory')!
  expect(scenarioSchema.safeParse({ ...memory, expect: { maxCount: -1 } }).success).toBe(false)
})
it.each(['duplicate', 'wrong-kind', 'invalid-json'])('rejects malformed corpus: %s', async failure => {
  const rows = await loadScenarios()
  const root = await mkdtemp(join(tmpdir(), 'personaai-e2-'))
  try {
    for (const kind of ['memory', 'profile', 'friend', 'twin']) {
      let suite = rows.filter(row => row.kind === kind)
      if (failure === 'duplicate' && kind === 'memory') suite = [suite[0]!, suite[0]!]
      if (failure === 'wrong-kind' && kind === 'memory') suite = rows.filter(row => row.kind === 'friend')
      await writeFile(join(root, `${kind}.json`), failure === 'invalid-json' && kind === 'memory' ? '{' : JSON.stringify(suite), 'utf-8')
    }
    await expect(loadScenarios(root)).rejects.toThrow()
  } finally {
    if (dirname(root) !== tmpdir() || !basename(root).startsWith('personaai-e2-')) throw new Error('Unexpected temporary path')
    await rm(root, { recursive: true })
  }
})

it('has near-miss friend cases where talking about an activity is not a find-people task', async () => {
  const friend = (await loadScenarios()).filter(row => row.kind === 'friend')
  const nearMiss = friend.filter(row => row.tags.includes('near-miss'))
  expect(nearMiss.length).toBeGreaterThanOrEqual(2)
  for (const row of nearMiss) expect(row.expect?.taskIntent).toBe(false)
})
