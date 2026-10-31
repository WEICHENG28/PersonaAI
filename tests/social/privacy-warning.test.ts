// 送出前隱私警告的偵測（src/lib/privacy/rules.ts 的 detectPrivacy）。
import { describe, expect, it } from 'vitest'
import { detectPrivacy } from '../../src/lib/privacy/rules'

describe('detectPrivacy：要跳警告', () => {
  it.each([
    ['我的微信号是 abc_12345', '社交账号'],
    ['加我vx：wxid_hello', '社交账号'],
    ['方便的话加我微信', '联系方式'],
    ['給你我的微信嗎', '联系方式'],
    ['你要加我微信嗎', '联系方式'],
    ['留个电话吧', '联系方式'],
    ['我们交换一下联系方式', '联系方式'],
    ['我的id 1245631', '社交账号'],
    ['账号是 abc_123', '社交账号'],
    ['QQ 12345678', '社交账号'],
    ['我电话 138 1234 5678', '手机号'],
    ['身份证 110101199003071234', '身份证号'],
    ['我住阳光小区5栋1单元302', '地址'],
    ['邮箱 me@example.com', '邮箱'],
    ['卡号 6222 0212 3456 7890 123', '银行卡号'],
    ['验证码是 834921', '密码或验证码'],
  ])('%s → %s', (text, hit) => {
    expect(detectPrivacy(text)).toContain(hit)
  })
})

describe('detectPrivacy：一般句子不跳', () => {
  it.each(['我喜欢爬山，周末大概走 30 分钟', '2024 年去过 3 次上海', '我们 13 个人一起去', '你平时用微信吗？', '刚刷了一会抖音', '我想要一个新手机壳', '下次给你发照片', '要不要一起去爬山', '我的idea 是周末去露营'])('%s', (text) => {
    expect(detectPrivacy(text)).toEqual([])
  })
})

it('身份證號不會又被算成銀行卡號', () => {
  expect(detectPrivacy('110101199003071234')).toEqual(['身份证号'])
})
