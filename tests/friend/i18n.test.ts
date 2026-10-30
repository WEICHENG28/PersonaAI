import { describe, expect, it } from 'vitest'
import zhCN from '../../messages/zh-CN.json'
import zhHK from '../../messages/zh-HK.json'
import en from '../../messages/en.json'

/** 收集所有鍵路徑（a.b.c），用於三語對齊檢查。 */
function flattenKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key)
  )
}

/** A0 必測：zh-HK / en 的訊息鍵與 zh-CN（預設）完全對齊，防止漏譯。 */
describe('i18n 訊息鍵對齊', () => {
  const baseKeys = flattenKeys(zhCN).sort()

  it('zh-CN 本身沒有重複鍵', () => {
    expect(new Set(baseKeys).size).toBe(baseKeys.length)
  })

  it.each([
    ['zh-HK', zhHK],
    ['en', en],
  ])('%s 的鍵與 zh-CN 完全一致', (_locale, messages) => {
    const keys = flattenKeys(messages).sort()
    expect(keys).toEqual(baseKeys)
  })

  it('每個語言的值都不是空字串', () => {
    for (const messages of [zhCN, zhHK, en]) {
      const values: string[] = []
      const walk = (node: unknown) => {
        if (typeof node === 'string') values.push(node)
        else if (typeof node === 'object' && node !== null)
          Object.values(node).forEach(walk)
      }
      walk(messages)
      values.forEach((value) => expect(value.length).toBeGreaterThan(0))
    }
  })
})
