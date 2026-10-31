// C0：10 位種子用戶（虛構角色），依 docs/07C 第 2 節 C0 表格擴寫。擁有者：C。
// scripts/seed.ts 寫入資料庫時另外設定：is_seed = true、social_agent_enabled = true、
// shareable_confirmed = true、auth_id = null；embedding 由 shareable 產生。
//
// Demo「幫我找 3 個喜歡登山的人聊聊」會用到前 3 位：
//   小安 → 雙向合適（慢熱溫和、相似型、沒有條件）
//   阿哲 → 對話摩擦（長句、多 emoji、話題跳很快，希望對方很主動）
//   子晴 → 單向合適（條件是「個性外向、主動找話題」，對方不夠外向就會覺得不合）
// Demo 結果不保證每次一樣，Demo 前要預跑，必要時調整這裡的資料。
// 畫面上會出現的內容一律簡體、大陸用語。

import type { AgentProfile, Preferences, Purpose, ShareableProfile } from '../../shared/types.js'

export interface SeedUser {
  key: string // 穩定識別碼，給 fixtures／stub 用；資料庫的 users.id 由 seed 產生，重跑時用 is_seed 找舊資料
  display_name: string
  purposes: Purpose[]
  preferences: Preferences
  shareable: ShareableProfile
  agent_profile: AgentProfile
}

const CONFIDENCE = 0.8

export const SEED_USERS: readonly SeedUser[] = [
  {
    key: 'seed-an',
    display_name: '小安',
    purposes: ['sport', 'friend'],
    preferences: { personality: 'similar', conditions: [] },
    shareable: {
      intro: '周末去郊区爬山，顺便拍照',
      interests: ['登山', '摄影', '看展'],
      chat_style: '慢热，熟了会分享很多照片和小发现',
      looking_for: '可以一起慢慢爬山、不赶行程的山友',
    },
    agent_profile: {
      big_five: {
        O: { score: 72, confidence: CONFIDENCE, evidence: '喜欢看展、会拍山上的光影和小植物' },
        C: { score: 60, confidence: CONFIDENCE, evidence: '出发前会查天气和路线，但不排太满' },
        E: { score: 35, confidence: CONFIDENCE, evidence: '自称慢热，刚认识时回复比较短' },
        A: { score: 80, confidence: CONFIDENCE, evidence: '说话温和，会先肯定对方的想法' },
        N: { score: 38, confidence: CONFIDENCE, evidence: '遇到行程变动通常说「没关系，再找时间」' },
      },
      values: ['尊重彼此步调', '享受过程', '真诚'],
      style: { sentence_length: 'short', tone: '温和、平静', emoji_level: 1, formality: 'casual' },
    },
  },
  {
    key: 'seed-zhe',
    display_name: '阿哲',
    purposes: ['sport'],
    preferences: { personality: 'similar', conditions: ['希望对方很主动'] },
    shareable: {
      intro: '越野跑和重训狂热者，停不下来',
      interests: ['登山', '越野跑', '重训'],
      chat_style: '节奏很快，一次丢很多话题',
      looking_for: '体力好、能一起挑战高海拔线路和越野赛的搭子',
    },
    agent_profile: {
      big_five: {
        O: { score: 65, confidence: CONFIDENCE, evidence: '一直想尝试新路线和新赛事' },
        C: { score: 45, confidence: CONFIDENCE, evidence: '计划常常临时改，想到就出发' },
        E: { score: 90, confidence: CONFIDENCE, evidence: '主动开话题，消息又长又多' },
        A: { score: 55, confidence: CONFIDENCE, evidence: '热情但较少接对方的话，常直接换话题' },
        N: { score: 40, confidence: CONFIDENCE, evidence: '对成绩有点急，但情绪恢复很快' },
      },
      values: ['挑战自我', '效率', '有话直说'],
      style: { sentence_length: 'long', tone: '热血、兴奋', emoji_level: 3, formality: 'casual' },
    },
  },
  {
    key: 'seed-qing',
    display_name: '子晴',
    purposes: ['sport', 'hobby'],
    preferences: { personality: 'similar', conditions: ['个性外向、主动找话题'] },
    shareable: {
      intro: '爬山露营派，帐篷里一定有咖啡',
      interests: ['登山', '露营', '咖啡'],
      chat_style: '健谈，喜欢你来我往地聊',
      looking_for: '外向、会主动找话题的露营和登山伙伴',
    },
    agent_profile: {
      big_five: {
        O: { score: 70, confidence: CONFIDENCE, evidence: '会研究不同产地的咖啡豆和露营地' },
        C: { score: 62, confidence: CONFIDENCE, evidence: '露营装备清单整理得很完整' },
        E: { score: 85, confidence: CONFIDENCE, evidence: '很快就能和陌生人聊开' },
        A: { score: 65, confidence: CONFIDENCE, evidence: '友善，但对话冷场时会明显失去兴趣' },
        N: { score: 35, confidence: CONFIDENCE, evidence: '遇到下雨改期也很快接受' },
      },
      values: ['热闹', '分享', '主动'],
      style: { sentence_length: 'medium', tone: '开朗、健谈', emoji_level: 2, formality: 'casual' },
    },
  },
  {
    key: 'seed-yu',
    display_name: '品妤',
    purposes: ['study'],
    preferences: { personality: 'similar', conditions: ['作息规律'] },
    shareable: {
      intro: '正在备战考研',
      interests: ['考研', '图书馆', '整理笔记'],
      chat_style: '认真、有条理，回复时间固定',
      looking_for: '可以互相督促、作息规律的研友',
    },
    agent_profile: {
      big_five: {
        O: { score: 55, confidence: CONFIDENCE, evidence: '愿意试新的读书方法，但偏好稳定' },
        C: { score: 88, confidence: CONFIDENCE, evidence: '每天都有读书进度表并确实执行' },
        E: { score: 40, confidence: CONFIDENCE, evidence: '比较常聊读书相关的话题' },
        A: { score: 70, confidence: CONFIDENCE, evidence: '乐意分享笔记和资源' },
        N: { score: 55, confidence: CONFIDENCE, evidence: '考试接近时会有点焦虑' },
      },
      values: ['自律', '守时', '互相帮忙'],
      style: { sentence_length: 'medium', tone: '认真、客气', emoji_level: 0, formality: 'neutral' },
    },
  },
  {
    key: 'seed-ming',
    display_name: '志明',
    purposes: ['study'],
    preferences: { personality: 'similar', conditions: [] },
    shareable: {
      intro: '写代码的，想找读书会伙伴',
      interests: ['编程', '读书会', '技术文章'],
      chat_style: '理性、直接，喜欢讲重点',
      looking_for: '想一起读技术书、互相 code review 的人',
    },
    agent_profile: {
      big_five: {
        O: { score: 75, confidence: CONFIDENCE, evidence: '常研究新的编程语言和工具' },
        C: { score: 70, confidence: CONFIDENCE, evidence: '读书会每周固定进度' },
        E: { score: 45, confidence: CONFIDENCE, evidence: '谈到技术才会变多话' },
        A: { score: 50, confidence: CONFIDENCE, evidence: '意见直接，不太修饰' },
        N: { score: 30, confidence: CONFIDENCE, evidence: '遇到 bug 也很冷静' },
      },
      values: ['逻辑', '效率', '持续学习'],
      style: { sentence_length: 'medium', tone: '理性、直接', emoji_level: 0, formality: 'neutral' },
    },
  },
  {
    key: 'seed-lin',
    display_name: '小林',
    purposes: ['sport'],
    preferences: { personality: 'similar', conditions: ['工作日晚上有空'] },
    shareable: {
      intro: '下班就去打球或健身',
      interests: ['篮球', '健身'],
      chat_style: '开朗，常开玩笑',
      looking_for: '工作日晚上能一起打球、健身的球友',
    },
    agent_profile: {
      big_five: {
        O: { score: 50, confidence: CONFIDENCE, evidence: '固定打球和健身，偶尔尝试新运动' },
        C: { score: 65, confidence: CONFIDENCE, evidence: '每周固定时段运动' },
        E: { score: 75, confidence: CONFIDENCE, evidence: '很容易和球场上的人聊起来' },
        A: { score: 72, confidence: CONFIDENCE, evidence: '打球时会主动帮队友' },
        N: { score: 35, confidence: CONFIDENCE, evidence: '输球也笑着说下次再来' },
      },
      values: ['团队合作', '健康', '轻松'],
      style: { sentence_length: 'short', tone: '开朗、爱开玩笑', emoji_level: 2, formality: 'casual' },
    },
  },
  {
    key: 'seed-xia',
    display_name: '夏夏',
    purposes: ['hobby', 'friend'],
    preferences: { personality: 'similar', conditions: [] },
    shareable: {
      intro: '动漫宅，漫展必到，也会画画',
      interests: ['动漫', '漫展', '画画'],
      chat_style: '热情、爱分享，会一直安利',
      looking_for: '一起逛漫展、聊新番的同好',
    },
    agent_profile: {
      big_five: {
        O: { score: 85, confidence: CONFIDENCE, evidence: '会画同人图，追很多类型的作品' },
        C: { score: 50, confidence: CONFIDENCE, evidence: '画画常拖稿，但漫展一定准时到' },
        E: { score: 78, confidence: CONFIDENCE, evidence: '聊到喜欢的作品就停不下来' },
        A: { score: 75, confidence: CONFIDENCE, evidence: '乐意分享资源和摊位信息' },
        N: { score: 50, confidence: CONFIDENCE, evidence: '喜欢的角色剧情不好时会很难过' },
      },
      values: ['热情', '分享', '创作'],
      style: { sentence_length: 'medium', tone: '热情、兴奋', emoji_level: 3, formality: 'casual' },
    },
  },
  {
    key: 'seed-kai',
    display_name: '阿凯',
    purposes: ['hobby'],
    preferences: { personality: 'complementary', conditions: [] },
    shareable: {
      intro: '动漫和桌游都爱，梗很多',
      interests: ['动漫', '桌游'],
      chat_style: '幽默，爱玩梗',
      looking_for: '一起玩桌游、能接梗的朋友',
    },
    agent_profile: {
      big_five: {
        O: { score: 70, confidence: CONFIDENCE, evidence: '喜欢尝试新出的桌游' },
        C: { score: 45, confidence: CONFIDENCE, evidence: '规则书常常看一半就开玩' },
        E: { score: 68, confidence: CONFIDENCE, evidence: '桌游局里负责活跃气氛' },
        A: { score: 65, confidence: CONFIDENCE, evidence: '玩笑不会针对人' },
        N: { score: 30, confidence: CONFIDENCE, evidence: '输了也自嘲带过' },
      },
      values: ['好玩', '轻松', '包容'],
      style: { sentence_length: 'short', tone: '幽默、轻松', emoji_level: 2, formality: 'casual' },
    },
  },
  {
    key: 'seed-yuqing',
    display_name: '雨晴',
    purposes: ['friend'],
    preferences: { personality: 'similar', conditions: [] },
    shareable: {
      intro: '喜欢电影和咖啡馆，平常写点东西',
      interests: ['电影', '咖啡馆', '写作'],
      chat_style: '安静、细腻，喜欢深入聊一个话题',
      looking_for: '能一起看电影、聊心得的朋友',
    },
    agent_profile: {
      big_five: {
        O: { score: 82, confidence: CONFIDENCE, evidence: '看很多独立电影，会写影评' },
        C: { score: 60, confidence: CONFIDENCE, evidence: '固定每周写一篇文章' },
        E: { score: 30, confidence: CONFIDENCE, evidence: '偏好一对一的安静聊天' },
        A: { score: 78, confidence: CONFIDENCE, evidence: '很会倾听，回应细心' },
        N: { score: 55, confidence: CONFIDENCE, evidence: '情绪细腻，容易被电影打动' },
      },
      values: ['深度', '真诚', '安静'],
      style: { sentence_length: 'medium', tone: '安静、细腻', emoji_level: 1, formality: 'neutral' },
    },
  },
  {
    key: 'seed-xiang',
    display_name: '宇翔',
    purposes: ['friend', 'hobby'],
    preferences: { personality: 'complementary', conditions: [] },
    shareable: {
      intro: '弹吉他、听很杂的音乐',
      interests: ['音乐', '吉他'],
      chat_style: '随性，想到什么聊什么',
      looking_for: '一起听音乐、交换歌单的朋友',
    },
    agent_profile: {
      big_five: {
        O: { score: 78, confidence: CONFIDENCE, evidence: '从独立乐队听到古典都有' },
        C: { score: 35, confidence: CONFIDENCE, evidence: '练琴没有固定时间，看心情' },
        E: { score: 60, confidence: CONFIDENCE, evidence: '在小型表演场合会主动和人聊' },
        A: { score: 70, confidence: CONFIDENCE, evidence: '对别人的音乐品味很包容' },
        N: { score: 40, confidence: CONFIDENCE, evidence: '个性随和，不太焦虑' },
      },
      values: ['自由', '创作', '随性'],
      style: { sentence_length: 'short', tone: '随性、放松', emoji_level: 1, formality: 'casual' },
    },
  },
]
