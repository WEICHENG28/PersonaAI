import { describe, expect, it } from 'vitest'
import { COPY_THRESHOLD, endsWithQuestion, maxBigramSimilarity, questionRatio } from '../../scripts/eval/metrics.js'

describe('評測指標', () => {
  it('問號結尾：結尾的 emoji 和收尾標點不算', () => {
    expect(endsWithQuestion('你呢？😂')).toBe(true)
    expect(endsWithQuestion('真的吗?')).toBe(true)
    expect(endsWithQuestion('好呀。')).toBe(false)
    expect(endsWithQuestion('你觉得呢？～')).toBe(true)
    expect(endsWithQuestion('')).toBe(false)
  })

  it('問號比例', () => {
    expect(questionRatio(['好', '吗？'])).toBe(0.5)
    expect(questionRatio([])).toBe(0)
  })

  it('照抄偵測：和參考句幾乎一樣就超過門檻，不相干的很低', () => {
    const refs = ['恭喜，熬完那一刻整个人都会松下来。', '下雨天窝着也挺好的。']
    expect(maxBigramSimilarity('恭喜！熬完那一刻整个人都会松下来', refs)).toBeGreaterThanOrEqual(COPY_THRESHOLD)
    expect(maxBigramSimilarity('周末要不要去爬山', refs)).toBeLessThan(0.3)
    expect(maxBigramSimilarity('随便', [])).toBe(0)
  })
})
