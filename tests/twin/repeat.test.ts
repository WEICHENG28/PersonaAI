// 分身重複句偵測：去標點後相同、整句包含、高度相似算重複；短句和不同內容不算。
import { describe, expect, it } from 'vitest'
import { askedQuestions, dropRepeatedSentences, findCatchphrase, findRepeat, isNearDuplicate, normalizeForRepeat, repeatProblem, splitSentences } from '../../server/twin/repeat'

describe('normalizeForRepeat', () => {
  it('去掉中英文標點、emoji 與空白', () => {
    expect(normalizeForRepeat('我真的 完全不拍照的啦！😂～')).toBe('我真的完全不拍照的啦')
  })
})

describe('isNearDuplicate', () => {
  it('實跑重複的句子：只差標點、語氣詞或前後多幾個字都算重複', () => {
    expect(isNearDuplicate('咖啡确实是我露营时不会漏掉的东西', '咖啡确实是我露营时不会漏掉的东西！')).toBe(true)
    expect(isNearDuplicate('我真的完全不拍照的啦', '我真的完全不拍照啦～')).toBe(true)
    expect(isNearDuplicate('哈哈，咖啡确实是我露营时不会漏掉的东西', '咖啡确实是我露营时不会漏掉的东西')).toBe(true)
  })

  it('話題相同但內容不同的不算重複', () => {
    expect(isNearDuplicate('咖啡确实是我露营时不会漏掉的东西', '我没有特别固定的咖啡豆，比较喜欢酸一点的')).toBe(false)
    expect(isNearDuplicate('你平时都去哪些山啊？', '那座山挺不错的')).toBe(false)
  })

  it('很短的句子只有完全相同才算', () => {
    expect(isNearDuplicate('好呀', '好呀！')).toBe(true)
    expect(isNearDuplicate('哈哈好呀', '哈哈好的')).toBe(false)
  })

  it('只有標點或 emoji 的訊息不算重複', () => {
    expect(isNearDuplicate('😂', '😂')).toBe(false)
  })
})

describe('findRepeat', () => {
  it('回傳被重複的那則；沒有就回 null', () => {
    expect(findRepeat('我也喜欢爬山', ['山顶风很大', '我也喜欢爬山！'])).toBe('我也喜欢爬山！')
    expect(findRepeat('我也喜欢爬山', ['山顶风很大'])).toBeNull()
  })
})

describe('findRepeat 逐句比對', () => {
  it('新訊息裡的一句和舊訊息裡的一句幾乎一樣就算重複，回傳舊的那句', () => {
    expect(findRepeat('我通常带一点简单的轻食。你喜欢拍哪一种？', ['我通常带一点简单的轻食。你会防晒吗？'])).toBe('我通常带一点简单的轻食。')
  })

  it('只有短句相同（「对呀」）不算重複', () => {
    expect(findRepeat('对呀！我比较喜欢拍花草。', ['对呀！山顶风很大。'])).toBeNull()
  })
})

describe('splitSentences／askedQuestions', () => {
  it('依句號、問號、感嘆號、波浪號切句，逗號不切，保留問號', () => {
    expect(splitSentences('好呀，我也去过～你呢？真的！')).toEqual(['好呀，我也去过～', '你呢？', '真的！'])
  })

  it('只挑出以問號結尾的句子', () => {
    expect(askedQuestions(['我喜欢看展。你喜欢美术馆还是博物馆？', '好呀', '你几点出发?'])).toEqual(['你喜欢美术馆还是博物馆？', '你几点出发?'])
  })
})

describe('findCatchphrase／repeatProblem（口頭禪）', () => {
  const said = ['我一想到高海拔就兴奋，完全停不下来！', '每次上山整个人就完全停不下来～', '山顶风很大']

  it('6 字以上的片段在自己最近 3 則裡出現 2 則以上，再說一次就算口頭禪', () => {
    expect(findCatchphrase('越野跑真的让我完全停不下来！', said)).toBe('完全停不下来')
  })

  it('只出現過 1 則、或超出最近 3 則的不算', () => {
    expect(findCatchphrase('越野跑真的让我完全停不下来！', ['完全停不下来', '山顶风很大', '我喜欢拍照'])).toBeNull()
    expect(findCatchphrase('越野跑真的让我完全停不下来！', [...said.slice(0, 2), 'a', 'b', 'c'])).toBeNull()
  })

  it('repeatProblem：重複句優先，其次口頭禪，都沒有回 null', () => {
    expect(repeatProblem('山顶风很大！', said)).toContain('「山顶风很大」几乎一样')
    expect(repeatProblem('越野跑真的让我完全停不下来！', said)).toContain('「完全停不下来」这种说法')
    expect(repeatProblem('我比较喜欢拍植物的细节', said)).toBeNull()
  })
})

describe('dropRepeatedSentences', () => {
  it('拿掉和自己說過的話幾乎一樣的句子，留下新的部分', () => {
    expect(dropRepeatedSentences('早晨光线好。你平时拍照通常都用什么设备？', ['你平时拍照通常都用什么设备？'])).toBe('早晨光线好。')
  })

  it('整則都是重複時原樣回傳，不送空訊息', () => {
    expect(dropRepeatedSentences('我也喜欢爬山。', ['我也喜欢爬山！'])).toBe('我也喜欢爬山。')
  })

  it('短句（「好呀」）不會被拿掉', () => {
    expect(dropRepeatedSentences('好呀！你平时拍照通常都用什么设备？', ['好呀！你平时拍照通常都用什么设备？', '其他'])).toBe('好呀！你平时拍照通常都用什么设备？')
  })
})
