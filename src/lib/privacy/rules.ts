// 個資偵測規則（純函式，前後端共用）。原本在 C2 隱私守門 server/twin/guard.ts，搬來這裡讓前端送出前也能用同一套規則。
// 個資格式以中國大陸為準（手機號 1 開頭 11 碼、18 位身份證號、微信／QQ 等帳號、小區＋棟＋單元地址）；簡繁字形都認。
// MASK、hits 會出現在畫面和工作日誌上，所以用簡體中文。
export const MASK = '（已隐藏）'

export interface MaskResult {
  text: string
  /** 命中的個資類型（不重複），例如「手机号」。 */
  hits: string[]
}

interface MaskRule {
  name: string
  pattern: RegExp
}

// 網址遇到中文或全形標點就停，避免把後面的句子一起吃掉
const URL_CHARS = '[^\\s\\u3000-\\u303f\\u4e00-\\u9fff\\uff00-\\uffef]+'
const NUM = '[0-9０-９零〇一二三四五六七八九十百]+'
const SP = '\\s*'

// 帳號：英文開頭 3 碼以上，或純數字 5 碼以上（QQ 號）。避免把「刷抖音 30 分钟」的數字當帳號
const ACCOUNT = '(?:[A-Za-z][A-Za-z0-9_.-]{2,}|\\d{5,})'
const PLATFORMS_LATIN = '(?:QQ|WeChat|wx|vx|Weibo|Bilibili|LINE|IG|Instagram)'
const PLATFORMS_CJK = '(?:微信|威信|V信|微博|抖音|快手|小[红紅][书書]|[Bb]站|[哔嗶][哩][哔嗶][哩])'
const ACCOUNT_LABEL = '(?:[号號]|[账帳][号號户戶]|ID|id)?'

// 地名用字：排除「我住、家在、去」這類動詞和代名詞，遮蔽時才不會把「我住」一起吃掉
const PLACE = '(?:[\\u4e00-\\u9fff](?<![我你他她住在到去是的]))'
const ROAD = '(?:路|街|大道|胡同|巷)'
const COMPOUND = '(?:小[区區]|花[园園]|公寓|家[园園]|新村|社[区區]|大厦|大廈|苑)'
const BUILDING_CORE = `${NUM}${SP}(?:[号號][楼樓]|[栋棟]|幢|座)`
const BUILDING = `(?:${SP}${BUILDING_CORE})`
const FLOOR = `(?:${SP}${NUM}${SP}[楼樓层層])`
const UNIT = `(?:${SP}${NUM}${SP}[单單]元)`
// 房號要寫「室」，或是 3～4 位數字（302、1501），避免吃掉後面的「2 个人」
const ROOM = `(?:${SP}(?:${NUM}${SP}室|\\d{3,4}(?!\\d)))`

// 順序有意義：email 要比 @帳號 先處理；身份證要比手機號先處理
const RULES: readonly MaskRule[] = [
  { name: '邮箱', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { name: '网址', pattern: new RegExp(`(?:https?:\\/\\/|www\\.)${URL_CHARS}`, 'gi') },
  {
    name: '社交账号',
    pattern: new RegExp(
      `(?:(?<![A-Za-z])${PLATFORMS_LATIN}(?![A-Za-z])|${PLATFORMS_CJK})${SP}${ACCOUNT_LABEL}${SP}是?${SP}[:：]?${SP}${ACCOUNT}`,
      'gi',
    ),
  },
  { name: '社交账号', pattern: /(?<![A-Za-z0-9_.])@[A-Za-z0-9_.]{2,}/g },
  {
    // 6 位地區碼＋8 位生日＋3 位順序碼＋校驗碼（數字或 X）
    name: '身份证号',
    pattern: /(?<![0-9A-Za-z])\d{6}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?![0-9A-Za-z])/g,
  },
  // 可加 +86，可用空格或連字號分成 3-4-4
  { name: '手机号', pattern: /(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d[-\s]?\d{4}[-\s]?\d{4}(?!\d)/g },
  // 0 開頭區號 2～3 碼＋7～8 碼，例：010-12345678、(0755)12345678
  { name: '座机', pattern: /(?<!\d)(?:\(0\d{2,3}\)|0\d{2,3}[-\s])\s?\d{7,8}(?!\d)/g },
  {
    // 道路門牌：（省市區）＋路名＋（段巷弄）＋號＋（樓棟／單元／室）
    name: '地址',
    pattern: new RegExp(
      `(?:${PLACE}{1,4}[省市])?(?:${PLACE}{1,4}[市区區县縣])?${PLACE}{1,5}${ROAD}` +
        `(?:${SP}${NUM}${SP}[段巷弄])*${SP}${NUM}${SP}[号號](?:院)?` +
        `${BUILDING}?${FLOOR}?${UNIT}?${ROOM}?`,
      'g',
    ),
  },
  // 小區地址：XX小区 5 栋 1 单元 302
  { name: '地址', pattern: new RegExp(`${PLACE}{1,8}?${COMPOUND}${BUILDING}${UNIT}?${ROOM}?`, 'g') },
  // 沒寫小區名，但有棟＋房號：5 栋 302、3 号楼 2 单元 501
  { name: '地址', pattern: new RegExp(`(?<![0-9０-９])${BUILDING_CORE}${UNIT}?${ROOM}`, 'g') },
]

/** 規則先擋（07C C2 第 1 點）：純函式，把個資換成 MASK。 */
export function maskByRules(text: string): MaskResult {
  return RULES.reduce<MaskResult>(
    (acc, rule) => {
      const masked = acc.text.replace(rule.pattern, MASK)
      if (masked === acc.text) return acc
      const hits = acc.hits.includes(rule.name) ? acc.hits : [...acc.hits, rule.name]
      return { text: masked, hits }
    },
    { text, hits: [] },
  )
}


// ── 送出前警告（只用來提醒，不遮蔽、不改 C2 的規則） ──

// 警告額外多認的：銀行卡號、密碼、驗證碼（這些不該出現在聊天裡，但 C2 不遮蔽）
const WARN_ONLY_RULES: readonly MaskRule[] = [
  { name: '银行卡号', pattern: /(?<!\d)(?:\d[\s-]?){15,18}\d(?!\d)/g },
  { name: '密码或验证码', pattern: /(?:密[码碼]|验证码|驗證碼|支付密[码碼])\s*(?:是|为|為)?\s*[:：]?\s*[A-Za-z0-9!@#$%^&*._-]{4,}/g },
  { name: '社交账号', pattern: /(?:加我|加个|加個|私聊|私信)s*(?:微信|V信|vx|wx|QQ|qq)/g },
]

/** 送出前檢查：回傳命中的個資類型（不重複），空陣列＝沒問題。 */
export function detectPrivacy(text: string): string[] {
  const masked = maskByRules(text)
  const hits = new Set(masked.hits)
  // 用遮蔽後的文字再比對，身份證號才不會又被當成銀行卡號
  for (const rule of WARN_ONLY_RULES) {
    rule.pattern.lastIndex = 0
    if (rule.pattern.test(masked.text)) hits.add(rule.name)
  }
  return [...hits]
}
