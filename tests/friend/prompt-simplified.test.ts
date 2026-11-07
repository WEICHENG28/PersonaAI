import { describe, expect, it } from 'vitest'
import { MEMORY_PROMPT_SYSTEM } from '../../server/prompts/02_memory.js'
import { PROFILE_PROMPT_SYSTEM } from '../../server/prompts/03_profile.js'
import { REPORT_PROMPT_SYSTEM } from '../../server/prompts/08_report.js'
import { FUN_PROMPT_SYSTEM } from '../../server/prompts/12_fun.js'

const SIMPLIFIED_RULE = '- 所有输出用简体中文，每个字都用简体；用户用繁体字写的内容，也要转成简体再写（例如「攝影」写成「摄影」）。'

describe('user-facing prompt output language', () => {
  it.each([
    ['memory', MEMORY_PROMPT_SYSTEM],
    ['profile', PROFILE_PROMPT_SYSTEM],
    ['report', REPORT_PROMPT_SYSTEM],
    ['fun', FUN_PROMPT_SYSTEM],
  ])('%s requires simplified Chinese before the JSON output instructions', (_name, prompt) => {
    expect(prompt).toContain('所有输出用简体中文')
    expect(prompt).toContain(SIMPLIFIED_RULE)
    expect(prompt.indexOf(SIMPLIFIED_RULE)).toBeLessThan(prompt.indexOf('只输出 JSON'))
  })

  it('uses the simplified character in the profile intro length example', () => {
    expect(PROFILE_PROMPT_SYSTEM).not.toContain('內')
    expect(PROFILE_PROMPT_SYSTEM).toContain('20 字内')
  })
})
