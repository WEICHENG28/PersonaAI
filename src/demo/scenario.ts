import type {
  AgentRole,
  FitPoint,
  Verdict,
} from '@lib/api/types'

/**
 * 02 §10/§3 的 demo 剧本内容（画面文字一律简体）。
 * 排程逻辑在 proxyTimeline.ts、阿澈挑回复在 friendChat.ts；这里只放内容。
 */

// ── 朋友线脚本（阿澈） ──

export interface FriendBeat {
  /** 稳定编号（记录「用过了」用） */
  id: string
  /** 触发时机：intro＝进入朋友页先打招呼；keyword＝命中关键词；story＝聊满 n 句后分享的小事 */
  when: 'intro' | 'keyword' | 'story'
  /** story：用户发满 n 则后才会出现 */
  afterN?: number
  /** keyword：命中任何一词 */
  keywords?: string[]
  text: string
  /** 伴随的记忆（写进「它记得的事」） */
  memory?: { content: string; confidence: 'low' | 'mid' | 'high' }
}

/** 进入朋友页、还没有讯息时阿澈先说的开场白（AI + 虚构声明，产品原则 2） */
export const friendIntro: string[] = [
  '嗨，我是阿澈。先说清楚：我是 AI，我的生活故事都是虚构的设定，不过是真的想跟你好好聊。',
  '我本来想周末去看展，结果还没决定要去哪一个。你周末都做什么呀？',
]

export const friendScript: FriendBeat[] = [
  {
    id: 'kw-comic',
    when: 'keyword',
    keywords: ['漫展', '动漫', '二次元', '展'],
    text: '漫展！我后来查了一下那个展，有个摊位好像挺有意思的。你是打算周末去吗？',
    memory: { content: '用户计划周末去漫展，喜欢动漫与漫展相关话题。', confidence: 'mid' },
  },
  {
    id: 'kw-hiking',
    when: 'keyword',
    keywords: ['登山', '爬山', '山'],
    text: '爬山不错啊，慢慢来。我朋友说登山最怕一开始走太快。你比较喜欢轻松的路线还是有点挑战的？',
    memory: { content: '用户开始接触登山，偏好还没确认。', confidence: 'low' },
  },
  {
    id: 'kw-busy',
    when: 'keyword',
    keywords: ['忙', '工作', '累', '上班'],
    text: '辛苦了。我最近也有点忙，室友昨晚还带朋友回来玩到三点…总之先深呼吸一下，今天别太勉强自己。',
  },
  // 轻事件：好消息（02 §F1 建模事件表）——聊熟一点才分享，并带一句过渡，不突兀
  {
    id: 'story-fanart',
    when: 'story',
    afterN: 4,
    text: '对了，想跟你分享一件小事：我投的同人图居然被选上了！等了快一个月，今天终于有消息。',
  },
]

/** 打招呼（你好／嗨／hi／在吗） */
export const friendGreetings: string[] = [
  '嗨嗨，我在呢！今天过得怎么样？',
  '你好呀～刚好想找人聊聊天。最近有什么新鲜事吗？',
  '在的在的。今天想聊点什么？',
]

/** 用户问阿澈问题时，分享自己的近况 */
export const friendSelfShares: string[] = [
  '我最近还行，在纠结周末要看哪个展，选择困难又犯了。你呢？',
  '我嘛，这周画了几张草稿，画得慢但挺开心的。',
  '最近迷上一家面包店，每天路过都想进去。你有这种店吗？',
  '最近在学着早点睡，目前失败了三天（笑）。你作息怎么样？',
]

/** 通用回复（剧本用完后轮流挑，不连续重复；不把每句都变成问题，02 风格规则） */
export const friendFallbacks: string[] = [
  '原来是这样，你多说一点？我想听。',
  '听起来挺有意思的，后来呢？',
  '嗯，我记下了。',
  '这个我还真没想过，你一说觉得挺有道理。',
  '哈哈，跟你聊天挺轻松的。',
  '懂了。那你最近心情怎么样？',
  '我在听，你慢慢说。',
  '这样啊，那对你来说算是好事吗？',
  '有意思，这让我更了解你一点了。',
  '嗯嗯，换作是我可能也会这样想。',
]

/** 模拟下次见面：阿澈带来的新近况 */
export const nextMeetLine = '上次我最后还是去了展，逛得比想象中久。你周末过得怎么样？'

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
  { speaker: 'twin', text: '这个说法有意思。我上周末去了家新开的咖啡馆，老板也是登山爱好者。', round: 3, privacyRewrite: true },
  { speaker: 'other-twin', text: '哈哈，登山圈比想象中大。你如果喜欢咖啡，山顶的咖啡跟平地喝起来完全不一样。', round: 3 },
  { speaker: 'twin', text: '听起来很值得试试。你通常跟朋友一起爬还是自己爬？', round: 4 },
  { speaker: 'other-twin', text: '都有。跟朋友爬热闹，自己爬安静。我比较喜欢自己爬，可以想事情。', round: 4 },
  { speaker: 'twin', text: '懂，我也是需要独处时间的人。不过有伴一起爬也有另外的乐趣。', round: 5 },
  { speaker: 'other-twin', text: '对，看心情。诶，你周末去的那家咖啡馆在哪儿呀？', round: 5 },
  { speaker: 'twin', text: '就在市区，具体的下次熟一点再告诉你。他们家冰手冲不错。', round: 6, privacyRewrite: true },
  { speaker: 'other-twin', text: '好呀。话说回来，你刚开始爬山，可以先走一条新手步道，坡缓、风景也好。', round: 6 },
  { speaker: 'twin', text: '好呀，我查查交通怎么去。谢谢推荐！', round: 7 },
  { speaker: 'other-twin', text: '不客气。之后爬了什么路线，欢迎回来跟我分享。', round: 7 },
]

// ── 评审判定（3 次，02 §6.2） ──

export const judgeVerdicts: Verdict[] = [
  { round: 2, mine: 68, theirs: 66, trend: 'flat', reason: '双方都在试探共同话题，登山与看展有交集。' },
  { round: 4, mine: 76, theirs: 74, trend: 'up', reason: '对方主动分享独处偏好，与我方「慢热」条件相符。' },
  { round: 7, mine: 84, theirs: 80, trend: 'up', reason: '双方互相推荐路线，话题自然延续，幽默有共鸣。' },
]

// ── 结果页 fit points（为什么你们合） ──

export const fitPoints: FitPoint[] = [
  { id: 'f-1', text: '你偏好慢热的人：对方第 4 轮说自己喜欢自己爬、可以想事情，节奏跟你合。', round: 4 },
  { id: 'f-2', text: '你在意话题能延伸：第 2 轮对方把登山和看展连成「慢慢走慢慢看」，接住了你的话。', round: 2 },
  { id: 'f-3', text: '共同兴趣具体可约：第 6 轮对方推荐了新手步道，聊出了下次一起爬的可能。', round: 6 },
]

/** 对话大纲：每一项附出现的轮次，只显示已经聊到的部分 */
export interface RoundItem {
  text: string
  round: number
}

export const outlineItems: {
  topics: RoundItem[]
  fitPoints: RoundItem[]
  frictionPoints: RoundItem[]
  highlights: RoundItem[]
} = {
  topics: [
    { text: '入门登山路线', round: 1 },
    { text: '看展与摄影', round: 2 },
    { text: '咖啡馆', round: 3 },
    { text: '独处与社交偏好', round: 4 },
  ],
  fitPoints: [
    { text: '登山 × 看展的交集', round: 2 },
    { text: '都偏慢热、需要独处时间', round: 5 },
    { text: '互相推荐了想去的地方', round: 6 },
  ],
  frictionPoints: [{ text: '对方更喜欢一个人爬，约一起爬要慢慢来', round: 4 }],
  highlights: [
    { text: '把登山比作「慢慢走慢慢看」', round: 2 },
    { text: '主动推荐新手步道', round: 6 },
  ],
}

// ── Agent 工作日志（02 §4 示例格式） ──

/** 日志跟着什么出现：开工时、某则讯息之后、某轮判定之后、全部结束时 */
export type LogAnchor =
  | { kind: 'start' }
  | { kind: 'msg'; step: number }
  | { kind: 'verdict'; round: number }
  | { kind: 'done' }

export interface LogBeat {
  role: AgentRole
  text: string
  reason: string
  anchor: LogAnchor
}

/** 大厅搜寻找到的人数（日志与回报卡共用） */
export const DEMO_SCREENED = 5

/** 第 0 笔和最后一笔的文字由 store 依任务内容替换（人数、完成条件） */
export const taskLogBeats: LogBeat[] = [
  { role: 'social', text: '收到任务', reason: '用户一句话交办', anchor: { kind: 'start' } },
  { role: 'social', text: `搜寻大厅：喜欢户外、个性偏安静 → 找到 ${DEMO_SCREENED} 位`, reason: '你偏好慢热的人', anchor: { kind: 'start' } },
  { role: 'judge', text: '和陈岭的代聊结束：判定不合适', reason: '对方节奏偏快，与你的慢热偏好冲突', anchor: { kind: 'start' } },
  { role: 'social', text: '选择林小山', reason: '价值观相近，对方也偏好慢热的人', anchor: { kind: 'start' } },
  { role: 'twin', text: '开始代聊，开场话题：最近的登山行程', reason: '双方共同兴趣', anchor: { kind: 'start' } },
  { role: 'judge', text: '第 2 轮判定：你的视角 68 分、对方视角 66 分', reason: '双方仍在试探，话题有交集', anchor: { kind: 'verdict', round: 2 } },
  { role: 'privacy', text: '第 3 轮讯息含可能识别你的信息 → 改写后送出', reason: '不泄露可定位的信息', anchor: { kind: 'msg', step: 4 } },
  { role: 'judge', text: '第 4 轮判定：你的视角 76 分、对方视角 74 分（走势上升）', reason: '对方主动揭露偏好，符合我方条件', anchor: { kind: 'verdict', round: 4 } },
  { role: 'social', text: '继续聊，暂不通知本人', reason: '还没聊完，先不打扰你', anchor: { kind: 'verdict', round: 4 } },
  { role: 'privacy', text: '第 6 轮讯息含可能识别你的信息 → 改写后送出', reason: '不泄露可定位的信息', anchor: { kind: 'msg', step: 10 } },
  { role: 'judge', text: '第 7 轮判定：你的视角 84 分、对方视角 80 分（3 次判定一致）', reason: '话题自然延续、幽默有共鸣', anchor: { kind: 'verdict', round: 7 } },
  { role: 'social', text: '双向合适 → 通知本人', reason: '两个方向分数都 ≥ 70', anchor: { kind: 'done' } },
]

// ── 历史尝试（不合适合例） ──

export const failedMatch = {
  id: 'match-fail',
  withName: '陈岭',
  result: 'no' as const,
  reasonType: 'friction' as const,
  reasonText: '在要不要安排紧凑行程的话题上意见分歧，对方节奏比你想象的快很多。',
  initiated: 'auto' as const,
}

// ── 接手卡片建议（附轮次，只给已经聊到的） ──

export const handoffSuggestItems: RoundItem[] = [
  { text: '对方偏慢热，先接话题再分享自己的事', round: 4 },
  { text: '对方问过你常去的咖啡馆，分身没说具体位置，接手后也先别说', round: 6 },
  { text: '对方刚推荐了新手步道，可以直接接着聊你想什么时候去', round: 6 },
]

/** 还没聊出东西时的通用建议 */
export const handoffSuggestDefault = '先打个招呼，接着对方最后一句话聊'

// ── 接手后：对方分身的回复（轮流挑） ──

export const otherTwinReplies: string[] = [
  '哈哈，原来是本人来了！我也很想听你自己说说。',
  '这样啊，那你最想先试哪一条路线？',
  '好呀，我记下了。你平时周末比较有空吗？',
  '听起来不错。我最近也在找人一起去看展。',
  '嗯嗯，慢慢来就好，不急。',
  '那下次有新路线我先跟你说。',
]
