/** 历史尝试种子（不合适合例） */
export const failedMatch = {
  id: 'match-fail',
  taskId: 'task-1',
  withName: '陈岭',
  result: 'no' as const,
  verdicts: [
    { round: 2, mine: 55, theirs: 58, trend: 'flat', reason: '开场热烈，但节奏偏快。' },
    { round: 4, mine: 52, theirs: 50, trend: 'down', reason: '对方偏好紧凑行程，与我方慢热偏好冲突。' },
    { round: 6, mine: 48, theirs: 47, trend: 'down', reason: '话题上意见分歧，冷场增多。' },
  ],
  myScore: 48,
  fitPoints: [],
  outline: {
    topics: ['登山强度', '周末安排'],
    fitPoints: ['都有登山兴趣'],
    frictionPoints: ['行程节奏', '聊天密度'],
    highlights: [],
  },
  reasonType: 'friction' as const,
  reasonText: '在要不要安排紧凑行程的话题上意见分歧，对方节奏比你想像的快很多。',
  initiated: 'auto' as const,
  startedAt: 0,
}
