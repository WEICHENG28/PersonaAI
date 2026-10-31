import { useNavigate } from 'react-router'
import { Button, Chip } from '@components/ui/Button'
import { RiveAvatar } from '@components/ui/RiveAvatar'
import { useDemoStore } from '@store/useDemoStore'

/**
 * 落地页（点 wordmark 进入）：依 02 的功能模块展开，每个 section 讲一个细节。
 * 每格 1-2 短句（less wordy）；无 emoji，视觉锚点用三个 Rive（robot/fish/birdie）。
 *
 * 组件化展示（仿 Hallmark Hum 模板「One round, four moments」的构成）：
 * 判定档位 / 记忆掌控 / 大厅 三个 section 不再用纯文字小卡，
 * 而是左边讲功能、右边渲染「真实产品组件的缩小版」（档位选择器、
 * 记忆列表、大厅卡片＋AI 导购输入框），让用户直接看到产品长相。
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
            <Button onClick={() => navigate(user ? '/friend' : '/login')}>
              开始使用
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
          AI 朋友只陪你聊；AI 人设由你编写、替你对外；评审只管判定。各司其职，谁也不冒充谁。
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
            <h3>AI 人设</h3>
            <p>你写的对外角色，替你去聊。想怎么被认识，就怎么写。</p>
            <ul className="role-card__list">
              <li>形象由你编写，不是被 AI 解读</li>
              <li>只拿你确认可对外的资料</li>
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
            <li>人设替你聊</li>
            <li>判定合不合适</li>
            <li>朋友回报 · 你接手</li>
          </ol>
        </div>
        <p className="landing-flow__note">全程可看 Agent 工作日志，每一笔附理由。</p>
      </section>

      {/* ── 判定与档位：档位选择器的缩小渲染 ── */}
      <section className="landing-feature">
        <div className="landing-feature__text">
          <h2>什么时候通知你，你说了算</h2>
          <p className="landing-sec__sub">
            两个档位自己选：单向合适机会多，双向合适更准。没成的也会记下原因，帮你更了解自己。
          </p>
        </div>
        <div className="landing-mock">
          <div className="landing-mock__bar">
            <span>设置 · 判定档位</span>
            <Chip tone="well">双向合适</Chip>
          </div>
          <div className="landing-mock__body landing-mock__gears">
            <div className="mock-gear">
              <strong>单向合适</strong>
              <span>AI 认为对方符合你的条件，就通知你</span>
            </div>
            <div className="mock-gear is-on">
              <strong>双向合适</strong>
              <span>两边都聊得来才通知（默认推荐）</span>
            </div>
          </div>
          <div className="landing-mock__foot">
            <span className="mock-bell" aria-hidden />
            评审 Agent：双向合适 84 / 80 · 现在通知你
          </div>
        </div>
      </section>

      {/* ── 记忆与掌控：记忆列表的缩小渲染 ── */}
      <section className="landing-feature">
        <div className="landing-feature__text">
          <h2>它记得什么，你说了算</h2>
          <p className="landing-sec__sub">
            每条记忆看得到、改得了、删得掉。大厅上的对外档案由记忆生成，首次发布前你过目一遍。
          </p>
        </div>
        <div className="landing-mock">
          <div className="landing-mock__bar">
            <span>我的档案 · 它记得的事</span>
            <Chip tone="mint">不存聊天原文</Chip>
          </div>
          <div className="landing-mock__body">
            <ul className="mock-mems">
              <li>
                <p>周末准备去登山，偏好入门路线</p>
                <footer>
                  <Chip tone="well">来源：用户主动提及</Chip>
                  <span>置信度 高</span>
                  <em>删除</em>
                </footer>
              </li>
              <li>
                <p>聊天节奏偏慢热，不喜欢被连番追问</p>
                <footer>
                  <Chip tone="well">来源：对话观察</Chip>
                  <span>置信度 中</span>
                  <em>编辑</em>
                </footer>
              </li>
            </ul>
          </div>
          <div className="landing-mock__foot">
            <span className="mock-shield" aria-hidden />
            不存聊天原文 · 删除立即生效
          </div>
        </div>
      </section>

      {/* ── 大厅：大厅卡片 + AI 导购输入框的缩小渲染 ── */}
      <section className="landing-feature">
        <div className="landing-feature__text">
          <h2>一个逛得起来的大厅</h2>
          <p className="landing-sec__sub">
            每人是 AI 生成的一张卡。像导购一样问 AI 该跟谁聊；代聊中随时按「我来说」，本人接手。
          </p>
        </div>
        <div className="landing-mock">
          <div className="landing-mock__bar">
            <span>大厅 · 候选人</span>
            <Chip tone="mint">本人在网上</Chip>
          </div>
          <div className="landing-mock__body">
            <div className="mock-cand">
              <div className="mock-cand__head">
                <strong>小周</strong>
                <span>AI 预估：很可能合</span>
              </div>
              <p>周末爬山、话不多但接得住冷笑话。</p>
              <div className="chips">
                <Chip tone="well">登山</Chip>
                <Chip tone="well">慢热</Chip>
                <Chip tone="paper">INFP · 仅供娱乐</Chip>
              </div>
              <div className="chips">
                <span className="mock-btn">本人去聊</span>
                <span className="mock-btn mock-btn--ghost">让 AI 人设先聊</span>
              </div>
            </div>
            <div className="mock-ask">
              <p className="mock-ask__q">有没有喜欢登山、但个性安静的人？</p>
              <div className="mock-ask__input">
                <span>问问大厅 AI…</span>
                <b>发送</b>
              </div>
            </div>
          </div>
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
        <Button onClick={() => navigate(user ? '/friend' : '/login')}>
          {user ? '回到阿澈身边' : '现在开始'}
        </Button>
        <p className="landing-note">注册即代表同意 AI 会在画面上清楚标示，对话为虚构角色设定。</p>
      </section>
    </div>
  )
}
