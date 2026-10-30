import type { Candidate } from '@lib/api/types'

/** Demo 种子资料：大厅候选人 + 记忆 + 对外档案（内容对齐 docs/02 的示例） */

export const candidates: Candidate[] = [
  {
    id: 'c-lin',
    name: '林小山',
    intro: '周末不是在山上就是在去山上的路上，话不多但聊得深。',
    interests: ['登山', '看展', '咖啡'],
    chatStyle: '慢热，句子短，喜欢追问细节',
    mbti: 'ISFP',
    status: 'online',
    fitPredict: 82,
  },
  {
    id: 'c-zhou',
    name: '周予安',
    intro: '书越买越多，读得越来越慢，正在找读书搭子。',
    interests: ['读书', '咖啡', '电影'],
    chatStyle: '温和有礼，话题会延伸',
    mbti: 'INFP',
    status: 'proxying',
    fitPredict: 74,
  },
  {
    id: 'c-chen',
    name: '陈岭',
    intro: '铁人三项训练中，能量永远用不完。',
    interests: ['跑步', '登山', '摄影'],
    chatStyle: '热情直接，节奏快',
    mbti: 'ESTP',
    status: 'online',
    fitPredict: 69,
  },
]

export const seedMemories = [
  {
    id: 'm-1',
    content: '用户计划周末去漫展，喜欢动漫与漫展相关话题。',
    source: '用户主动提及',
    createdAt: 0,
    confidence: 'mid',
  },
]

export const seedProfile = {
  intro: '周末会去漫展的二次元，也在慢慢开始爬山。',
  interests: ['动漫', '漫展', '看展', '登山（新手）'],
  chatStyle: '慢热但真诚，喜欢先听再说',
  mbti: 'INFP',
  confirmed: false,
}
