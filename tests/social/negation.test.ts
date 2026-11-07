import { expect, it } from 'vitest'
import { NEGATION_PATTERN, isNegated, stripLikePrefix, conditionKeyword } from '../../shared/negation.js'
it('uses exactly the approved negation pattern', () => {
  expect(NEGATION_PATTERN.source).toBe(/(不太?喜欢|不爱|讨厌|不感兴趣|没(什么|啥)?兴趣|不想|(?<!哪)怕|受不了|反感|不再|不(吃|喝|玩|看|碰))/.source)
})
it.each(['不喜欢昆虫', '不太喜欢昆虫', '不爱昆虫', '讨厌昆虫', '不感兴趣昆虫', '没什么兴趣昆虫', '不想昆虫', '怕昆虫', '受不了昆虫', '反感昆虫', '不再喜欢昆虫', '不吃昆虫'])('extracts negative keyword %s', text => {
  expect(isNegated(text)).toBe(true)
  expect(conditionKeyword(text)).toEqual({ key: '昆虫', negated: true })
})
it('keeps positive and 哪怕 phrases positive', () => {
  expect(isNegated('特别喜欢登山')).toBe(false)
  expect(isNegated('哪怕下雨也想爬山')).toBe(false)
  expect(stripLikePrefix('我特别喜欢登山')).toBe('登山')
  expect(conditionKeyword('喜欢登山')).toEqual({ key: '登山', negated: false })
})

it.each(['对昆虫不感兴趣', '我对昆虫不感兴趣', '昆虫没什么兴趣'])('preserves topics before a trailing negation: %s', text => {
  expect(conditionKeyword(text)).toEqual({ key: '昆虫', negated: true })
})
