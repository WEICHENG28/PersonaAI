import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tables, makeTable, failTable, validExtract } from './profile-test-fixtures'
import { clearAuthCaches } from '../../server/lib/authCache.js'

vi.mock('../../server/lib/auth.js', () => ({
  requireAuth: vi.fn(async () => ({ authId: 'auth-u1' })), isAuthFailure: () => false,
}))
vi.mock('../../server/lib/supabase.js', () => ({ getServiceClient: () => ({ from: (name: string) => tables[name]?.self ?? failTable(name) }) }))
vi.mock('../../server/lib/llm/index.js', () => ({ llmJson: vi.fn(), embed: vi.fn(async () => [0.1, 0.2]) }))
vi.mock('../../server/lib/log.js', () => ({ writeLog: vi.fn(async () => {}) }))

import { llmJson, embed } from '../../server/lib/llm/index.js'
import { dropNegatedInterests, extractProfile, getShareableView, shareableToText } from '../../server/friend/profile.js'
import { PROFILE_PROMPT_SYSTEM, profileExtractSchema, renderProfileSystem } from '../../server/prompts/03_profile.js'
import { getAgentProfile, getShareableProfile, getStyleProfile } from '../../server/contracts/friend.js'
import { fallbackCard } from '../../server/twin/lobby.js'
import { cardUserMessage } from '../../server/prompts/10_card.js'
import { friendRoutes } from '../../server/routes/friend.js'

beforeEach(() => {
  clearAuthCaches()
  vi.clearAllMocks()
  vi.stubEnv('SUPABASE_URL', '')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
  for (const name of Object.keys(tables)) delete tables[name]
  makeTable('user_profiles'); makeTable('friend_messages'); makeTable('users').list.push({ id: 'u1' })
  vi.mocked(llmJson).mockResolvedValue(profileExtractSchema.parse(validExtract()) as never)
})
afterEach(() => vi.unstubAllEnvs())

describe('dropNegatedInterests 子句规则', () => {
  it.each([
    [['昆虫', '登山'], ['我不喜欢昆虫', '周末去登山'], ['登山']],
    [['不喜欢昆虫'], [], []],
    [['昆虫', '登山'], ['我不喜欢昆虫，喜欢登山'], ['登山']],
    [['昆虫', '登山'], ['我喜欢登山，但不喜欢昆虫'], ['登山']],
    [['爬山'], ['我对爬山没兴趣'], []],
    [['游泳'], ['我不喜欢游泳', '我喜欢游泳'], ['游泳']],
    [['游泳'], ['我喜欢游泳', '我不喜欢游泳'], ['游泳']],
    [['摄影'], ['今天聊聊音乐'], ['摄影']],
    [['游泳'], ['我以前喜欢游泳，现在不喜欢了'], ['游泳']],
  ] as [string[], string[], string[]][])('%j / %j → %j', (interests, lines, expected) => {
    expect(dropNegatedInterests(interests, lines)).toEqual(expected)
  })
  it.each(['，', ',', '。', '；', ';', '！', '!', '？', '?'])('以 %s 切子句，各自判正反', delimiter => {
    expect(dropNegatedInterests(['登山', '昆虫'], [`我喜欢登山${delimiter}我不喜欢昆虫`])).toEqual(['登山'])
  })
  it('不修改原始数组', () => {
    const interests = ['昆虫', '登山'], lines = ['我不喜欢昆虫，喜欢登山']
    expect(dropNegatedInterests(interests, lines)).toEqual(['登山'])
    expect(interests).toEqual(['昆虫', '登山'])
    expect(lines).toEqual(['我不喜欢昆虫，喜欢登山'])
  })
})

describe('档案 prompt', () => {
  it('去掉特定 avoidance 范例并保留固定规则', () => {
    expect(PROFILE_PROMPT_SYSTEM).not.toContain('昆虫')
    expect(PROFILE_PROMPT_SYSTEM).toContain('"avoidance": ["用户不喜欢或想避开的话题/事物"]')
    for (const line of [
      '- 只根据用户自己的事：用户提到别人（朋友、家人）喜欢什么，不算用户的兴趣。',
      '- 过去的兴趣（「以前喜欢」「现在不玩了」）不放进 interests。',
      '- 只是在考虑、还没确定的（「可能会试试」）不放进 interests。',
      '- 只提到一次的经历（例如「昨天吃了一次火锅」）不算兴趣；要用户说喜欢，或在不同时候多次正面提到才算。',
    ]) expect(PROFILE_PROMPT_SYSTEM).toContain(line)
    expect(PROFILE_PROMPT_SYSTEM.indexOf('只根据用户自己的事')).toBeGreaterThan(PROFILE_PROMPT_SYSTEM.indexOf('【重要：喜欢 vs 不喜欢的区分】'))
    expect(PROFILE_PROMPT_SYSTEM.indexOf('只提到一次的经历')).toBeLessThan(PROFILE_PROMPT_SYSTEM.indexOf('输入：'))
  })
  it('一次替换，原样保留 $&、$1 与用户内容中的 {{previous}}', () => {
    const rendered = renderProfileSystem({ userLines: '$& {{previous}}', previous: '$1 {{user_lines}}' })
    expect(rendered).toContain('- 用户说过的话：$& {{previous}}')
    expect(rendered).toContain('- 上一版资料：$1 {{user_lines}}')
  })
})

describe('AI 写入及手动确认边界', () => {
  it.each([false, true])('AI 草稿／force 写入前过滤，回传与 embedding 使用过滤后的兴趣（force=%s）', async (force) => {
    const output = profileExtractSchema.parse(validExtract())
    output.shareable_profile.interests = ['昆虫', '登山', '不喜欢昆虫']
    output.agent_profile.avoidance = ['仅内部的回避主题']
    vi.mocked(llmJson).mockResolvedValue(output as never)
    tables.friend_messages!.list.push({ user_id: 'u1', role: 'user', content: '我不喜欢昆虫，周末去登山' })
    if (force) tables.user_profiles!.list.push({ shareable_profile: validExtract().shareable_profile, shareable_confirmed: true })
    const view = await extractProfile('u1', { force })
    const saved = tables.user_profiles!.upsert.mock.calls[0]![0]
    expect(saved.shareable_profile.interests).toEqual(['登山'])
    expect(view.shareable?.interests).toEqual(['登山'])
    expect(saved.agent_profile.avoidance).toEqual(['仅内部的回避主题'])
    expect(embed).toHaveBeenCalledWith(expect.stringContaining('兴趣：登山'), 'bg')
    expect(vi.mocked(embed).mock.calls[0]?.[0]).not.toContain('昆虫')
    expect(JSON.stringify(view)).not.toContain('avoidance')
    expect(JSON.stringify(view)).not.toContain('仅内部的回避主题')
    expect(output.shareable_profile.interests).toEqual(['昆虫', '登山', '不喜欢昆虫'])
  })
  it('M-5 已确认且非 force 仍只更新内部档案', async () => {
    const publicProfile = { ...validExtract().shareable_profile, interests: ['游泳'] }
    tables.user_profiles!.list.push({ user_id: 'u1', shareable_profile: publicProfile, shareable_confirmed: true, card: { headline: '原卡' }, embedding: [9] })
    tables.friend_messages!.list.push({ user_id: 'u1', role: 'user', content: '我不喜欢游泳' })
    expect(await extractProfile('u1')).toEqual({ shareable: publicProfile, confirmed: true, exists: true })
    expect(tables.user_profiles!.upsert).not.toHaveBeenCalled()
    expect(Object.keys(tables.user_profiles!.update.mock.calls[0]![0]).sort()).toEqual(['agent_profile', 'updated_at'])
    expect(embed).not.toHaveBeenCalled()
  })
  it('PUT 手动确认以用户为准，旧否定聊天不会移除手填游泳', async () => {
    tables.friend_messages!.list.push({ user_id: 'u1', role: 'user', content: '我不喜欢游泳' })
    const response = await friendRoutes.request('/profile/shareable', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intro: '我的介绍', interests: ['游泳'], chat_style: '随意', looking_for: '朋友' }),
    })
    expect(response.status).toBe(200)
    expect(tables.user_profiles!.list[0]).toMatchObject({ shareable_profile: { interests: ['游泳'] }, shareable_confirmed: true })
    expect(await response.json()).toMatchObject({ data: { shareable: { interests: ['游泳'] } } })
    expect(llmJson).not.toHaveBeenCalled()
  })
})

it('avoidance 留在内部 AgentProfile，不出现在 shareable、style、卡片或 profile API', async () => {
  vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only')
  const output = profileExtractSchema.parse(validExtract())
  output.agent_profile.avoidance = ['仅内部的回避主题']
  tables.user_profiles!.list.push({ shareable_profile: output.shareable_profile, agent_profile: output.agent_profile, shareable_confirmed: true })
  expect((await getAgentProfile('u1'))?.avoidance).toEqual(['仅内部的回避主题'])
  const response = await friendRoutes.request('/profile')
  expect(response.status).toBe(200)
  vi.mocked(llmJson).mockResolvedValue(output as never)
  const extracted = await friendRoutes.request('/profile/extract', { method: 'POST' })
  expect(extracted.status).toBe(200)
  const publicOutputs = [
    await getShareableProfile('u1'), await getStyleProfile('u1'), await getShareableView('u1'),
    fallbackCard(output.shareable_profile), cardUserMessage(output.shareable_profile, null),
    shareableToText(output.shareable_profile), await response.json(), await extracted.json(),
  ]
  expect(JSON.stringify(publicOutputs)).not.toContain('avoidance')
  expect(JSON.stringify(publicOutputs)).not.toContain('仅内部的回避主题')
})
