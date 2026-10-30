import type {
  AgentRole,
  FitPoint,
  Verdict,
} from '@lib/api/types'

/**
 * 02 §10/§3 的 demo 时间线。
 * 每一步是一个 Action，由 store 按 tick 推进（画面即时反映）。
 * delay 全部走 store 的 scheduler，方便「加速」与测试。
 */

// ── 朋友线脚本（阿澈） ──

export interface FriendBeat {
  /** 触发时机 */
  when: 'intro' | 'reply' | 'after-n' | 'keyword' | 'next-meet'
  /** after-n：用户发满 n 则后触发 */
  afterN?: number
  /** keyword：命中任何一词 */
  keywords?: string[]
  speaker: 'friend' | 'human'
  text: string
  /** 伴随的记忆（写进「它记得的事」） */
  memory?: { content: string; confidence: 'low' | 'mid' | 'high' }
}

export const friendScript: FriendBeat[] = [
  // 初次自我介绍（AI + 虚构声明，产品原则 2）
  {
    when: 'intro',
    speaker: 'friend',
    text: '嗨，我是阿澈。先说清楚：我是 AI，我的生活故事都是虚构的设定，不过感情是真的想跟你好好聊。',
  },
  {
    when: 'intro',
    speaker: 'friend',
    text: '我本来想周末去看展，结果还没决定要去哪一个。你周末都做什么呀？',
  },
  // 轻事件：好消息（02 §F1 建模事件表）
  {
    when: 'after-n',
    afterN: 1,
    speaker: 'friend',
    text: '对了！我投的同人图居然被选上了！！等了快一个月。',
  },
  // 关键词：漫展 → 记忆
  {
    when: 'keyword',
    keywords: ['漫展', '动漫', '二次元', '展'],
    speaker: 'friend',
    text: '漫展！我后来查了一下那个展，有个摊位好像满有意思的。你是打算周末去吗？',
    memory: { content: '用户计划周末去漫展，喜欢动漫与漫展相关话题。', confidence: 'mid' },
  },
  // 关键词：登山
  {
    when: 'keyword',
    keywords: ['登山', '爬山', '山'],
    speaker: 'friend',
    text: '爬山不错啊，慢慢来。我朋友说登山最怕一开始走太快。你比较喜欢轻松的路线还是有点挑战的？',
    memory: { content: '用户开始接触登山，偏好还没确认。', confidence: 'low' },
  },
  // 关键词：忙 / 工作（中强度事件前奏）
  {
    when: 'keyword',
    keywords: ['忙', '工作', '累', '上班'],
    speaker: 'friend',
    text: '辛苦了。我最近工作也有点满，明天还要上班，室友昨晚还带朋友回来玩到三点…总之先深呼吸一下。',
  },
  // 兜底回复（不把每句话都变成问题，02 风格规则）
  {
    when: 'reply',
    speaker: 'friend',
    text: '嗯嗯，我懂那种感觉。你这么一说我也想起来一些事。',
  },
  {
    when: 'reply',
    speaker: 'friend',
    text: '哈哈，确实是。跟你聊天还满舒服的。',
  },
  {
    when: 'reply',
    speaker: 'friend',
    text: '这样啊。那你自己怎么看？',
  },
]

// ── 代聊线脚本（分身 ↔ 对方分身，林小山） ──

export interface ProxyBeat {
  speaker: 'twin' | 'other-twin'
  text: string
  round: number
  privacyRewrite?: boolean
}

export const proxyScript: ProxyBeat[] = [
  { speaker: 'twin', text: '嗨，看你常去登山。我最近刚开始爬山，有什么推荐的入门路线吗？', round: 1 },
  { speaker: 'other-twin', text: '你好呀。入门的话，先从郊山开始吧，海拔低、补给方便的那种。你平时运动多吗？', round: 1 },
  { speaker: 'twin', text: '不算多，平时就是周末到处走走看看展。想找件能固定做的运动。', round: 2 },
  { speaker: 'other-twin', text: '看展我也喜欢，上个月刚看过一个摄影展。登山和看展其实很像，都是慢慢走慢慢看。', round: 2 },
  { speaker: 'twin', text: '这个说法有意思。我上周末去了家新开的咖啡店，老板也是登山爱好者。', round: 3, privacyRewrite: true },
  { speaker: 'other-twin', text: '哈哈，登山圈比想象中大。你如果喜欢咖啡，山顶的咖啡跟平地喝起来完全不一样。', round: 3 },
  { speaker: 'twin', text: '听起来很值得试试。你通常跟朋友一起爬还是自己爬？', round: 4 },
  { speaker: 'other-twin', text: '都有。跟朋友爬热闹，自己爬安静。我比较喜欢自己爬，可以想事情。', round: 4 },
  { speaker: 'twin', text: '懂，我也是需要独处时间的人。不过有伴一起爬也有另外的乐趣。', round: 5 },
  { speaker: 'other-twin', text: '对，看心情。诶，你周末去的那家咖啡店叫什么名字？', round: 5 },
  { speaker: 'twin', text: '在市中心新开的那家，叫「山径」。他们家冰手冲不错。', round: 6 },
  { speaker: 'other-twin', text: '记下来了！话说回来，你刚开始爬山，要不要从 XX 步道开始？新手友好，风景也好。', round: 6 },
  { speaker: 'twin', text: '好呀，我查查交通怎么去。谢谢推荐！', round: 7 },
  { speaker: 'other-twin', text: '不客气。之后爬了什么路线，欢迎回来跟我分享。', round: 7 },
]

// ── 评审判定（3 次，02 §6.2） ──

export const judgeVerdicts: Verdict[] = [
  {
    round: 2,
    mine: 68,
    theirs: 66,
    trend: 'flat',
    reason: '双方都在试探共同话题，登山与看展有交集。',
  },
  {
    round: 4,
    mine: 76,
    theirs: 74,
    trend: 'up',
    reason: '对方主动分享独处偏好，与我方「慢热」条件相符。',
  },
  {
    round: 7,
    mine: 84,
    theirs: 80,
    trend: 'up',
    reason: '双方互相推荐路线与店铺，话题自然延续， humor 共鸣。',
  },
]

// ── 结果页 fit points（为什么你们合） ──

export const fitPoints: FitPoint[] = [
  { id: 'f-1', text: '你偏好慢热的人：对方第 4 轮说自己喜欢自己爬、可以想事情，节奏跟你合。', round: 4 },
  { id: 'f-2', text: '你在意话题能延伸：第 2 轮对方把登山和看展连成「慢慢走慢慢看」，接住了你的话。', round: 2 },
  { id: 'f-3', text: '共同兴趣具体可约：第 6 轮对方推荐了新手步道，聊出了下次一起爬的可能。', round: 6 },
]

export const outline = {
  topics: ['入门登山路线', '看展与摄影', '咖啡店', '独处与社交偏好'],
  fitPoints: ['登山 × 看展的交集', '都偏慢热、需要独处时间', '互相推荐了具体地点'],
  frictionPoints: ['对方周末时间比较满，约爬山要提前约'],
  highlights: ['把登山比作「慢慢走慢慢看」', '主动推荐新手步道'],
}

// ── Agent 工作日志（02 §4 示例格式） ──

export interface LogBeat {
  role: AgentRole
  text: string
  reason: string
}

export const taskLogBeats: LogBeat[] = [
  { role: 'social', text: '收到任务：找 3 个喜欢登山的人聊聊（目的：运动伙伴，完成条件：2 位双向合适）', reason: '用户一句话交办' },
  { role: 'social', text: '搜寻大厅：喜欢户外、个性偏安静 → 找到 5 位', reason: '你偏好慢热的人' },
  { role: 'social', text: '选择林小山', reason: '价值观相近，对方也偏好慢热的人' },
  { role: 'twin', text: '开始代聊，开场话题：最近的登山行程', reason: '双方共同兴趣' },
  { role: 'privacy', text: '第 3 轮讯息含具体店名地点 → 改写为抽象描述后送出', reason: '不泄露可定位的具体地点' },
  { role: 'judge', text: '第 2 轮判定：你的视角 68 分、对方视角 66 分', reason: '双方仍在试探，话题有交集' },
  { role: 'judge', text: '第 4 轮判定：你的视角 76 分、对方视角 74 分（2 次一致，走势上升）', reason: '对方主动揭露偏好，符合我方条件' },
  { role: 'social', text: '继续聊，暂不通知本人', reason: '未达到通知档位（双向合适）' },
  { role: 'judge', text: '第 7 轮判定：你的视角 84 分、对方视角 80 分（3 次判定一致）', reason: '话题自然延续、幽默有共鸣、互相推荐具体地点' },
  { role: 'social', text: '双向合适 → 通知本人（进度 1 / 2）', reason: '两个方向分数都 ≥ 70' },
]

// ── 历史尝试（不合适合例） ──

export const failedMatch = {
  id: 'match-fail',
  withName: '陈岭',
  result: 'no' as const,
  reasonType: 'friction' as const,
  reasonText: '在要不要安排紧凑行程的话题上意见分歧，对方节奏比你想像的快很多。',
  initiated: 'auto' as const,
}

// ── 接手卡片建议 ──

export const handoffSuggest = [
  '对方刚推荐了新手步道，可以直接接着聊你想什么时候去',
  '对方问过咖啡店名字，已经答了「山径」，别重复',
  '对方偏慢热，先接话题再分享自己的事',
]
