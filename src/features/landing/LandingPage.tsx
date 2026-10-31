import { useNavigate } from 'react-router'
import { Button, Chip } from '@components/ui/Button'
import { RiveAvatar } from '@components/ui/RiveAvatar'
import { useDemoStore } from '@store/useDemoStore'

/**
 * 落地页（点 wordmark 进入）：依 02 的功能模块展开，每个 section 讲一个细节。
 * 每格 1-2 短句（less wordy）；无 emoji，视觉锚点用三个 Rive（robot/fish/birdie）。
 */
export function LandingPage() {
  const navigate = useNavigate()
  const user = useDemoStore((s) => s.user)

  return (
    <div className="landing">
      {/* 顶栏由 AppShell 统一提供（全站一致） */}

      {/* ── Hero：settled，产品卡放撕纸地上 ── */}
      <section className="landing-hero">
        <div className="landing-hero__text">
          <h1>
            AI 朋友认识你，
            <br />
            社交 Agent 替你
            <mark>找到合得来的人</mark>。
          </h1>
          <p className="landing-hero__sub">
            聊天认识你的 AI 朋友，加上一组替你跑完「找人、代聊、判定」的社交 Agent。你只在最后接手聊得来的人。
          </p>
          <div className="landing-actions">
            <Button onClick={() => navigate(user ? '/friend' : '/')}>
              {user ? '回去找阿澈' : '免费开始（Demo）'}
            </Button>
            <Button variant="secondary" onClick={() => navigate('/lobby')}>
              先逛逛大厅
            </Button>
          </div>
          <p className="landing-note">AI 永远标示 · 角色生活是虚构设定 · 你掌控对外行为</p>
        </div>

        {/* 产品卡：一句对话示意（卡纸 + 卷角） */}
        <figure className="landing-card" aria-hidden>
          <div className="landing-card__tab">AI 朋友 · 阿澈</div>
          <div className="landing-card__chat">
            <p className="landing-card__msg landing-card__msg--friend">
              你不在的时候，我帮你看了一下。有 2 个人跟你很合，其中一个也喜欢爬山。
            </p>
            <p className="landing-card__msg landing-card__msg--twin">
              <Chip tone="ink">AI 代聊中</Chip>
              看你常去登山，有什么入门路线推荐吗？
            </p>
            <p className="landing-card__msg landing-card__msg--meta">
              评审 Agent：双向合适 <b>84 / 80</b>（第 7 轮）
            </p>
          </div>
        </figure>
      </section>

      {/* ── 三个角色（卡纸卡，各配一个 Rive） ── */}
      <section className="landing-roles">
        <h2>三个角色，替你社交</h2>
        <p className="landing-sec__sub">
          AI 朋友只陪你聊；分身只替你对外；评审只管判定。各司其职，谁也不冒充谁。
        </p>
        <div className="landing-roles__grid">
          <article className="role-card">
            <RiveAvatar name="chromabot" size={96} />
            <h3>AI 朋友</h3>
            <p>有稳定性格和虚构生活。陪你聊、记得你说过的事，慢慢认识你。</p>
            <ul className="role-card__list">
              <li>你说过的事，下一句还接得上</li>
              <li>记得什么，随时可看可删</li>
              <li>从不多问，只聊你带进来的话题</li>
            </ul>
          </article>
          <article className="role-card">
            <RiveAvatar name="fish" size={96} />
            <h3>你的分身</h3>
            <p>替你去聊。只模仿你的说话风格，不使用你的原句。</p>
            <ul className="role-card__list">
              <li>句长、语气、emoji 习惯跟你</li>
              <li>只用你确认可对外的资料</li>
              <li>不知道的事说「这我要问本人」</li>
            </ul>
          </article>
          <article className="role-card">
            <RiveAvatar name="birdie" size={96} />
            <h3>评审 Agent</h3>
            <p>每几轮判定一次合不合，双向都合适才通知你。</p>
            <ul className="role-card__list">
              <li>双方视角各评一份</li>
              <li>3 次判定取多数，走势看得见</li>
              <li>判定附理由，进工作日志</li>
            </ul>
          </article>
        </div>
      </section>

      {/* ── 流程：卡纸 tile 排在撕纸带上 ── */}
      <section className="landing-flow">
        <h2>一句话交办，剩下交给 Agent</h2>
        <p className="landing-sec__sub">你说「帮我找 3 个喜欢登山的人聊聊」，其余自己跑完。</p>
        <div className="landing-flow__strip">
          <ol className="landing-flow__tiles">
            <li>跟阿澈聊天</li>
            <li>一句话交办找人</li>
            <li>分身替你聊</li>
            <li>判定合不合适</li>
            <li>朋友回报 · 你接手</li>
          </ol>
        </div>
        <p className="landing-flow__note">全程可看 Agent 工作日志，每一笔附理由。</p>
      </section>

      {/* ── 判定与档位 ── */}
      <section className="landing-detail">
        <h2>什么时候通知你，你说了算</h2>
        <div className="landing-detail__grid">
          <article className="detail-card">
            <h3>单向合适档</h3>
            <p>AI 认为对方符合你的条件，就通知你。</p>
            <p className="detail-card__hint">机会多一些，适合先广聊。</p>
          </article>
          <article className="detail-card">
            <h3>双向合适档</h3>
            <p>两边都聊得来才通知，默认推荐。</p>
            <p className="detail-card__hint">机会少一点，成功率更高。</p>
          </article>
          <article className="detail-card">
            <h3>不合也有收获</h3>
            <p>没成的原因会归类记下：不双向、条件不符、对话摩擦。</p>
            <p className="detail-card__hint">AI 朋友会用这些帮你更了解自己。</p>
          </article>
        </div>
      </section>

      {/* ── 记忆与掌控 ── */}
      <section className="landing-detail">
        <h2>它记得什么，你说了算</h2>
        <div className="landing-detail__grid">
          <article className="detail-card">
            <h3>记得的事看得到</h3>
            <p>每条记忆有内容、来源、置信度，不存聊天原文。</p>
          </article>
          <article className="detail-card">
            <h3>改得了、删得掉</h3>
            <p>觉得不像你，一句话归档；想删，立即硬删。</p>
          </article>
          <article className="detail-card">
            <h3>对外档案经你确认</h3>
            <p>大厅上的介绍由 AI 从记忆生成，首次发布前你过目一遍。</p>
          </article>
        </div>
      </section>

      {/* ── 大厅 ── */}
      <section className="landing-detail">
        <h2>一个逛得起来的大厅</h2>
        <div className="landing-detail__grid">
          <article className="detail-card">
            <h3>卡片浏览</h3>
            <p>每人是 AI 生成的一张卡：一句话介绍、兴趣、聊天风格。</p>
          </article>
          <article className="detail-card">
            <h3>问 AI 该跟谁聊</h3>
            <p>「有没有喜欢登山、但个性安静的人？」——像导购一样问。</p>
          </article>
          <article className="detail-card">
            <h3>随时本人接手</h3>
            <p>代聊中任何时候按「我来说」，先看接手重点再开口。</p>
          </article>
        </div>
      </section>

      {/* ── 数字：三个关键数字在梨黄纸上 ── */}
      <section className="landing-stats">
        <div className="landing-stats__in">
          <div className="stat-item">
            <b>15-20</b>
            <span>轮对话 · 约 2 分钟跑完</span>
          </div>
          <div className="stat-item">
            <b>3</b>
            <span>次判定取多数，走势可见</span>
          </div>
          <div className="stat-item">
            <b>~2</b>
            <span>小时，6 场代聊帮你省下</span>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="landing-cta">
        <h2>认识你的 AI 朋友</h2>
        <p className="landing-sec__sub">第一句问候开始，剩下的它自己会安排。</p>
        <Button onClick={() => navigate(user ? '/friend' : '/')}>
          {user ? '回到阿澈身边' : '现在开始'}
        </Button>
        <p className="landing-note">注册即代表同意 AI 会在画面上清楚标示，对话为虚构角色设定。</p>
      </section>
    </div>
  )
}
