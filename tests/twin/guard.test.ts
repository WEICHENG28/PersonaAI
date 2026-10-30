// C2 隱私守門：maskByRules（必測：每種個資格式的遮蔽、不誤傷一般句子）＋ guardText 主流程（LLM、日誌用假的）。
// 個資格式以中國大陸為準；測試輸入用簡體（實際畫面上的樣子），也抽測幾個繁體寫法。
import { describe, expect, it, vi } from 'vitest'
import type { AgentLogInput, ShareableProfile } from '../../shared/types'
import { guardResultSchema, renderGuardSystem } from '../../server/prompts/13_guard'
import { createGuardText, GUARD_FALLBACK, MASK, maskByRules, type GuardDeps } from '../../server/twin/guard'

function expectMasked(input: string, secret: string, hit: string): void {
  const result = maskByRules(input)
  expect(result.text, `應該遮掉「${secret}」`).not.toContain(secret)
  expect(result.text).toContain(MASK)
  expect(result.hits).toContain(hit)
}

describe('maskByRules：會遮蔽的個資', () => {
  it('手機號（各種寫法）', () => {
    expectMasked('我的手机 13812345678', '13812345678', '手机号')
    expectMasked('打给我 138-1234-5678 哦', '1234-5678', '手机号')
    expectMasked('号码是 138 1234 5678', '1234 5678', '手机号')
    expectMasked('+86 199 8765 4321 是我', '8765 4321', '手机号')
    expectMasked('+8615012345678', '15012345678', '手机号')
  })

  it('座機', () => {
    expectMasked('公司电话 010-12345678', '12345678', '座机')
    expectMasked('打 (0755)87654321 找我', '87654321', '座机')
    expectMasked('家里 0571 8888666', '8888666', '座机')
  })

  it('郵箱', () => {
    expectMasked('发到 an.hiker@qq.com 就好', 'an.hiker@qq.com', '邮箱')
    expectMasked('邮箱 xiaoan@163.com', 'xiaoan@163.com', '邮箱')
  })

  it('網址（中文緊接在後面時不吃掉）', () => {
    const result = maskByRules('我的相册 https://photos.example.cn/an?id=1你看看')
    expect(result.text).not.toContain('photos.example.cn')
    expect(result.text.endsWith('你看看')).toBe(true)
    expect(result.hits).toContain('网址')
    expectMasked('来逛 www.example.cn', 'www.example.cn', '网址')
  })

  it('社交帳號（微信、QQ、微博、小紅書、抖音、B站、LINE、@帳號）', () => {
    expectMasked('加我微信 anhiker88', 'anhiker88', '社交账号')
    expectMasked('我的微信号是：wxid_abc123', 'wxid_abc123', '社交账号')
    expectMasked('加我vx：an_hiker', 'an_hiker', '社交账号')
    expectMasked('QQ 123456789 有事找我', '123456789', '社交账号')
    expectMasked('QQ号：987654321', '987654321', '社交账号')
    expectMasked('微博 an.photo', 'an.photo', '社交账号')
    expectMasked('小红书账号 xiaoan_climb', 'xiaoan_climb', '社交账号')
    expectMasked('抖音号是 an2024hike', 'an2024hike', '社交账号')
    expectMasked('B站 id：anhike', 'anhike', '社交账号')
    expectMasked('LINE ID：an_hiker', 'an_hiker', '社交账号')
    expectMasked('关注我 @an_hiker_cn', 'an_hiker_cn', '社交账号')
    expectMasked('加我微信號 anhiker88', 'anhiker88', '社交账号')
  })

  it('身份證號（18 位，含 X）', () => {
    expectMasked('身份证 110101199003074518', '110101199003074518', '身份证号')
    expectMasked('证件号 44030519851231002X', '44030519851231002X', '身份证号')
  })

  it('道路門牌地址', () => {
    expectMasked('我住建国路88号', '建国路88号', '地址')
    expectMasked('在北京市朝阳区建国路 88 号 2 号楼 1501', '建国路 88 号', '地址')
    expectMasked('上海市浦东新区世纪大道100号5楼', '世纪大道100号', '地址')
    expectMasked('南京东路三段 12 弄 5 号', '5 号', '地址')
    expectMasked('家在东城区南锣鼓巷 8 号', '南锣鼓巷 8 号', '地址')
    expectMasked('我住在中山路123號5樓', '中山路123號', '地址')
  })

  it('小區、樓棟、單元、房號', () => {
    expectMasked('我住阳光小区5栋1单元302', '5栋1单元302', '地址')
    expectMasked('翠湖花园 3 号楼 2 单元 501 室', '501', '地址')
    expectMasked('宿舍在 5 栋 302', '5 栋 302', '地址')
  })

  it('遮地址時保留前面的「我住」', () => {
    expect(maskByRules('我住阳光小区5栋1单元302').text.startsWith('我住')).toBe(true)
  })

  it('一句話有多種個資時全部遮掉，hits 不重複', () => {
    const result = maskByRules('手机 13812345678，邮箱 a@b.com，备用 15987654321')
    expect(result.text).not.toMatch(/13812345678|15987654321|a@b\.com/)
    expect([...result.hits].sort()).toEqual(['手机号', '邮箱'].sort())
  })
})

describe('maskByRules：不誤傷一般句子', () => {
  const safeSentences = [
    '我住在山上很安静',
    '我每周爬山 3 次',
    '这条步道大概 5 公里，下午 3 点集合',
    '我 2024 年开始跑步，全马 42195 米',
    '南京路的咖啡馆很好逛',
    '中山路上那家店开到 10 号',
    '我们约在地铁 7 号口',
    '坐 3 号线过去',
    '我们这里 3 号开学',
    '考试考了 90 分',
    '我很喜欢用微信聊天',
    '每天刷抖音 30 分钟',
    '我在 B站 看了 3 个视频',
    '我用 QQ 音乐听歌',
    '今天 10:30 出发',
    '我最喜欢的山是泰山',
    '我住 18 楼',
    '这栋楼很高',
    '这次活动有 12356 人报名',
    '我在 online game 认识朋友',
    '这个 box size 刚好',
  ]

  it.each(safeSentences)('不改動：「%s」', (sentence) => {
    expect(maskByRules(sentence)).toEqual({ text: sentence, hits: [] })
  })

  it('空字串回傳空字串', () => {
    expect(maskByRules('')).toEqual({ text: '', hits: [] })
  })
})

const OWNER = 'user-an'
const anShareable: ShareableProfile = {
  intro: '周末去郊区爬山，顺便拍照',
  interests: ['登山', '摄影', '看展'],
  chat_style: '慢热，熟了会分享很多照片和小发现',
  looking_for: '可以一起慢慢爬山、不赶行程的山友',
}

describe('renderGuardSystem（Prompt 13）', () => {
  it('填入對外檔案與訊息，要求簡體，沒有殘留的 {{ }}', () => {
    const system = renderGuardSystem({ shareable: anShareable, text: '我在清华读书' })
    expect(system).toContain('隐私守门')
    expect(system).toContain('登山、摄影、看展')
    expect(system).toContain('我在清华读书')
    expect(system).toContain(MASK)
    expect(system).toContain('用简体中文')
    expect(system).not.toMatch(/\{\{|\}\}/)
  })

  it('沒有對外檔案時寫明沒有，內容含 $ 也照原樣放入', () => {
    const system = renderGuardSystem({ shareable: null, text: '花了 $100' })
    expect(system).toContain('（没有对外档案）')
    expect(system).toContain('花了 $100')
  })

  it('schema：rewritten 預設 null、issues 預設空陣列', () => {
    expect(guardResultSchema.parse({ ok: true })).toEqual({ ok: true, rewritten: null, issues: [] })
  })
})

type LlmOut = { ok: boolean; rewritten: string | null; issues: string[] }

function harness(opts: { llmOut?: LlmOut; llmError?: Error; shareable?: ShareableProfile | null } = {}) {
  const logs: AgentLogInput[] = []
  const llm = vi.fn(async () => {
    if (opts.llmError) throw opts.llmError
    return opts.llmOut ?? { ok: true, rewritten: null, issues: [] }
  })
  const getShareable = vi.fn(async () => (opts.shareable === undefined ? anShareable : opts.shareable))
  const deps: GuardDeps = {
    getShareableProfile: getShareable,
    llmJson: llm as unknown as GuardDeps['llmJson'],
    writeLog: async (entry) => {
      logs.push(entry)
    },
  }
  return { guardText: createGuardText(deps), logs, llm, getShareable }
}

function systemSentToLlm(llm: ReturnType<typeof vi.fn>): string {
  return (llm.mock.calls[0]![0] as { system: string }).system
}

describe('guardText', () => {
  it('沒有個資、LLM 也說沒問題 → 原樣送出，不寫改寫日誌', async () => {
    const h = harness()
    const result = await h.guardText('我也喜欢爬山，最近去了郊区', OWNER)
    expect(result).toEqual({ ok: true, text: '我也喜欢爬山，最近去了郊区', issues: [] })
    expect(h.getShareable).toHaveBeenCalledWith(OWNER)
    expect(h.llm).toHaveBeenCalledWith(expect.objectContaining({ role: 'fast', temperature: 0 }))
    expect(systemSentToLlm(h.llm)).toContain('登山、摄影、看展')
    expect(h.logs).toEqual([])
  })

  it('規則擋到個資 → 回傳遮蔽版、ok = false，交給 LLM 的也是遮蔽版', async () => {
    const h = harness()
    const result = await h.guardText('加我微信 anhiker88 吧', OWNER)
    expect(result.ok).toBe(false)
    expect(result.text).toBe(`加我${MASK} 吧`)
    expect(result.issues).toEqual(['包含社交账号'])
    expect(systemSentToLlm(h.llm)).not.toContain('anhiker88')
    expect(h.logs).toEqual([
      expect.objectContaining({ user_id: OWNER, agent: 'guard', action: '改写分身消息', reason: '包含社交账号' }),
    ])
  })

  it('LLM 判定洩漏 → 用改寫版，issues 合併規則與 LLM 的結果', async () => {
    const h = harness({ llmOut: { ok: false, rewritten: `我在北京读书，号码${MASK}`, issues: ['提到具体学校名称'] } })
    const result = await h.guardText('我在清华读书，号码 13812345678', OWNER)
    expect(result).toEqual({
      ok: false,
      text: `我在北京读书，号码${MASK}`,
      issues: ['包含手机号', '提到具体学校名称'],
    })
    expect(h.logs).toHaveLength(1)
    expect(h.logs[0]).toMatchObject({ agent: 'guard', action: '改写分身消息', reason: '包含手机号、提到具体学校名称' })
  })

  it('LLM 判定洩漏但沒給改寫 → 換成「这个我之后再跟你说」', async () => {
    const h = harness({ llmOut: { ok: false, rewritten: null, issues: ['提到感情私事'] } })
    const result = await h.guardText('我上个月刚分手', OWNER)
    expect(result).toEqual({ ok: false, text: GUARD_FALLBACK, issues: ['提到感情私事'] })
  })

  it('LLM 判定洩漏但 issues 是空的 → 補一個預設原因', async () => {
    const h = harness({ llmOut: { ok: false, rewritten: '我平时住在城里', issues: [] } })
    const result = await h.guardText('我住在朝阳那边', OWNER)
    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(['可能泄露隐私'])
  })

  it('LLM 的改寫版又出現個資 → 再遮一次', async () => {
    const h = harness({ llmOut: { ok: false, rewritten: '有事打 13812345678', issues: ['提到具体行程'] } })
    const result = await h.guardText('明天 8 点在西直门见', OWNER)
    expect(result.text).toBe(`有事打 ${MASK}`)
    expect(result.issues).toEqual(['提到具体行程', '包含手机号'])
  })

  it('LLM 說沒問題時，就算帶了 rewritten 也不採用', async () => {
    const h = harness({ llmOut: { ok: true, rewritten: '别的句子', issues: [] } })
    expect(await h.guardText('我喜欢拍照', OWNER)).toEqual({ ok: true, text: '我喜欢拍照', issues: [] })
  })

  it('LLM 失敗 → 只送出規則處理後的版本，並寫日誌（不記原文）', async () => {
    const h = harness({ llmError: new Error('timeout') })
    const result = await h.guardText('我的手机 13812345678', OWNER)
    expect(result).toEqual({ ok: false, text: `我的手机 ${MASK}`, issues: ['包含手机号'] })
    expect(h.logs).toHaveLength(1)
    expect(h.logs[0]).toMatchObject({ user_id: OWNER, agent: 'guard', action: '隐私检查失败' })
    expect(h.logs[0]!.reason).toContain('规则')
    expect(JSON.stringify(h.logs)).not.toContain('13812345678')
  })

  it('LLM 失敗且規則沒擋到 → 原樣送出（ok = true），仍寫失敗日誌', async () => {
    const h = harness({ llmError: new Error('timeout') })
    expect(await h.guardText('我喜欢拍照', OWNER)).toEqual({ ok: true, text: '我喜欢拍照', issues: [] })
    expect(h.logs.map((l) => l.action)).toEqual(['隐私检查失败'])
  })

  it('讀對外檔案失敗也走保守處理', async () => {
    const h = harness()
    h.getShareable.mockRejectedValueOnce(new Error('db down'))
    const result = await h.guardText('邮箱 xiaoan@163.com', OWNER)
    expect(result).toEqual({ ok: false, text: `邮箱 ${MASK}`, issues: ['包含邮箱'] })
    expect(h.llm).not.toHaveBeenCalled()
    expect(h.logs.map((l) => l.action)).toEqual(['隐私检查失败'])
  })

  it('沒有對外檔案時照樣檢查', async () => {
    const h = harness({ shareable: null })
    await h.guardText('我喜欢拍照', OWNER)
    expect(systemSentToLlm(h.llm)).toContain('（没有对外档案）')
  })

  it('空白訊息不呼叫 LLM', async () => {
    const h = harness()
    expect(await h.guardText('   ', OWNER)).toEqual({ ok: true, text: '   ', issues: [] })
    expect(h.llm).not.toHaveBeenCalled()
  })
})
