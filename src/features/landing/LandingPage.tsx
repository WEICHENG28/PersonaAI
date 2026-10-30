import { useNavigate } from 'react-router'
import { Button, Chip } from '@components/ui/Button'
import { RiveAvatar } from '@components/ui/RiveAvatar'
import { useDemoStore } from '@store/useDemoStore'

/**
 * 落地页（点 wordmark 进入）：依 02 的核心流程，less wordy。
 * Hum 构成：settled hero（大字 + 卡纸产品卡）→ 三张角色卡（卡纸）→
 * 一句流程（卡纸 tile 排在撕纸带上）→ CTA（梨黄 button）。
 */
export function LandingPage() {
  const navigate = useNavigate()
  const user = useDemoStore((s) => s.user)

  return (
    <div className="landing">
      {/* 顶栏由 AppShell 统一提供（全站一致） */}

      {/* ── Hero：settled，产品卡放在撕纸地上 ── */}
      <section className="landing-hero">
        <div className="landing-hero__text">
          <h1>
            AI 朋友认识你，
            <br />
            社交 Agent 替你
            <mark>找到合得来的人</mark>。
          </h1>
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

        {/* 产品卡：一句对话示意（卡纸 + 页角卷曲） */}
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

      {/* ── 三个角色（卡纸卡） ── */}
      <section className="landing-roles">
        <h2>三个角色，替你社交</h2>
        <div className="landing-roles__grid">
          <article className="role-card">
            <RiveAvatar name="robot" size={88} />
            <h3>AI 朋友</h3>
            <p>陪你聊、记得你说过的事，慢慢认识你。</p>
          </article>
          <article className="role-card">
            <h3 className="role-emoji">🎭</h3>
            <h3>你的分身</h3>
            <p>模仿你的说话风格，替你去聊；不使用你的原句。</p>
          </article>
          <article className="role-card">
            <h3 className="role-emoji">⚖️</h3>
            <h3>评审 Agent</h3>
            <p>每几轮判定一次合不合，双向合适才通知你。</p>
          </article>
        </div>
      </section>

      {/* ── 一句流程：卡纸 tile 排在撕纸带上 ── */}
      <section className="landing-flow">
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

      {/* ── 数字：三个关键数字在梨黄纸上（Hum「figures on the pear field」） ── */}
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
        <Button onClick={() => navigate(user ? '/friend' : '/')}>
          {user ? '回到阿澈身边' : '现在开始'}
        </Button>
        <p className="landing-note">注册即代表同意 AI 会在画面上清楚标示，对话为虚构角色设定。</p>
      </section>
    </div>
  )
}
