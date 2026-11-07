import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Button, Chip } from '@components/ui/Button'
import { Modal } from '@components/ui/Modal'
import { useDemoStore } from '@store/useDemoStore'
import { isHttpMode } from '@lib/api/friend'
import { joinLobbyNow, quickProfile, startFirstTask, type OnboardingView } from '@lib/api/social'
import { loadOnboardingAfterMessages } from '../messageLoaders'

const POLL_MS = 15_000

function storageKey(kind: 'done' | 'collapsed', userId: string) {
  return `personaai:onboarding:${kind}:${userId}`
}
function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}
function writeFlag(key: string, on: boolean) {
  try {
    if (on) localStorage.setItem(key, '1')
    else localStorage.removeItem(key)
  } catch {
    /* 存不了就算了 */
  }
}

/**
 * 新手任务（AI 朋友页上方）：聊天 → 档案 → 进大厅 → 交办第一个任务 → 看第一份结果。
 * 进度由后端从现有纪录算出，中途离开、下次回来会停在原来那一步。可以收起；全部完成看过一次就不再出现。
 * 用法：const guide = useOnboardingGuide(用户说了几句, (taskId) => 打开任务确认卡)；画面放 {guide.node}，guide.active 时可隐藏其他提示。
 * 擁有者：B（放在 A 的 FriendPage）。
 */
export function useOnboardingGuide(userMessageCount: number | null, onTaskCreated: (taskId: string) => void): { node: ReactNode; active: boolean } {
  const user = useDemoStore((s) => s.user)
  const navigate = useNavigate()
  const [view, setView] = useState<OnboardingView | null>(null)
  const [collapsed, setCollapsed] = useState(() => (user ? readFlag(storageKey('collapsed', user.id)) : false))
  const [hidden, setHidden] = useState(() => (user ? readFlag(storageKey('done', user.id)) : false))
  const [quickOpen, setQuickOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!isHttpMode || !user || hidden) return
    loadOnboardingAfterMessages(userMessageCount)?.then(setView).catch(() => {})
  }, [user, hidden, userMessageCount])

  // 每多说一句就重新看进度
  useEffect(load, [load])

  // 等任务结果时定时更新（结果是 worker 在后台跑出来的）
  const waiting = view?.current === 'task' || view?.current === 'result'
  useEffect(() => {
    if (!waiting) return
    const id = window.setInterval(load, POLL_MS)
    return () => window.clearInterval(id)
  }, [waiting, load])

  if (!isHttpMode || !user || hidden || !view) return { node: null, active: false }

  const run = async (action: () => Promise<OnboardingView | void>) => {
    setBusy(true)
    setError(null)
    try {
      const next = await action()
      if (next) setView(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : '没有成功，请再试一次')
    } finally {
      setBusy(false)
    }
  }

  const finish = () => {
    writeFlag(storageKey('done', user.id), true)
    setHidden(true)
  }
  const toggle = (on: boolean) => {
    writeFlag(storageKey('collapsed', user.id), on)
    setCollapsed(on)
  }

  const total = view.steps.length
  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
      <strong>新手任务</strong>
      <Chip tone={view.current ? 'pear' : 'mint'}>
        {view.doneCount}/{total}
      </Chip>
      <span style={{ marginLeft: 'auto' }}>
        <Button small variant="secondary" onClick={() => toggle(!collapsed)}>
          {collapsed ? '展开' : '先收起'}
        </Button>
      </span>
    </div>
  )

  if (collapsed) {
    return { node: <div className="card" style={{ padding: 'var(--space-sm) var(--space-md)' }}>{header}</div>, active: Boolean(view.current) }
  }

  const step = view.current
  let body: ReactNode
  if (step === 'chat' || step === 'profile') {
    const left = Math.max(0, view.chatNeed - view.userMessages)
    body = (
      <>
        <p>
          {step === 'chat'
            ? `先跟阿澈说说你最近在忙什么、喜欢做什么（还差 ${left} 句）。不想慢慢聊，也可以回答 3 个问题马上生成档案。`
            : '阿澈正在从聊天里整理你的档案，多聊几句兴趣会更准；也可以回答 3 个问题马上生成。'}
        </p>
        <div className="next-actions">
          <Button small onClick={() => setQuickOpen(true)}>
            快速建档（1 分钟）
          </Button>
          {step === 'profile' && (
            <Button small variant="secondary" onClick={() => navigate('/profile')}>
              去「我的档案」看看
            </Button>
          )}
        </div>
      </>
    )
  } else if (step === 'lobby') {
    body = (
      <>
        <p>你的档案准备好了。进大厅后，别人能看到这张卡片（不会给出聊天记录），社交 Agent 也能帮你找人。</p>
        {view.shareable && (
          <div className="card stack" style={{ padding: 'var(--space-sm)' }}>
            <strong>{view.shareable.intro}</strong>
            <div>
              {view.shareable.interests.map((i) => (
                <Chip key={i} tone="mint">
                  {i}
                </Chip>
              ))}
            </div>
          </div>
        )}
        <div className="next-actions">
          <Button small variant="secondary" onClick={() => navigate('/profile')}>
            先改改档案
          </Button>
          <Button small disabled={busy} onClick={() => void run(joinLobbyNow)}>
            {busy ? '加入中…' : '加入大厅'}
          </Button>
        </div>
      </>
    )
  } else if (step === 'task') {
    body = (
      <>
        <p>让社交 Agent 帮你找 1 位聊得来的人试试：它会先让你们的分身聊一聊，合适才告诉你。也可以直接跟阿澈说「帮我找…」。</p>
        <div className="next-actions">
          <Button
            small
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const task = await startFirstTask()
                onTaskCreated(task.id)
              })
            }
          >
            {busy ? '准备中…' : '帮我找 1 位朋友'}
          </Button>
        </div>
      </>
    )
  } else if (step === 'result') {
    body = (
      <>
        <p>分身正在替你聊，通常几分钟就会有结果，有结果阿澈会告诉你。可以先去大厅逛逛。</p>
        <div className="next-actions">
          {view.latestTaskId && (
            <Button small variant="secondary" onClick={() => navigate(`/tasks/${view.latestTaskId}`)}>
              看任务进度
            </Button>
          )}
          <Button small variant="secondary" onClick={() => navigate('/lobby')}>
            去大厅逛逛
          </Button>
        </div>
      </>
    )
  } else {
    body = (
      <>
        <p>新手任务全部完成！你已经体验了完整流程：阿澈认识你、分身替你聊、结果回到你手上。</p>
        <div className="next-actions">
          {view.resultConversationId && (
            <Button small variant="secondary" onClick={() => navigate(`/chat/${view.resultConversationId}/result`)}>
              看代聊结果
            </Button>
          )}
          <Button small onClick={finish}>
            知道了
          </Button>
        </div>
      </>
    )
  }

  const node = (
    <div className="card stack" style={{ padding: 'var(--space-md)' }} role="region" aria-label="新手任务">
      {header}
      <ol style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2xs)', listStyle: 'none', padding: 0, margin: 0 }}>
        {view.steps.map((s, i) => (
          <li key={s.key}>
            <Chip tone={s.done ? 'mint' : s.key === step ? 'coral' : 'ink'}>
              {i + 1}. {s.label}
              {s.done ? '（完成）' : ''}
            </Chip>
          </li>
        ))}
      </ol>
      {body}
      {error && (
        <p className="chip chip--coral" role="alert">
          {error}
        </p>
      )}
      <QuickProfileDialog open={quickOpen} onClose={() => setQuickOpen(false)} onSaved={(next) => (setView(next), setQuickOpen(false))} />
    </div>
  )
  return { node, active: Boolean(view.current) }
}

function QuickProfileDialog({ open, onClose, onSaved }: { open: boolean; onClose(): void; onSaved(view: OnboardingView): void }) {
  const [intro, setIntro] = useState('')
  const [interests, setInterests] = useState('')
  const [lookingFor, setLookingFor] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      onSaved(await quickProfile({ intro, interests: interests.split(/[、,，;；\s]+/).filter(Boolean), looking_for: lookingFor }))
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，请再试一次')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} demo={false} onClose={busy ? undefined : onClose} title="快速建档" sub="回答 3 个问题就能生成你的对外档案，之后随时可以在「我的档案」修改">
      <div className="stack">
        <label className="field">
          <span>1. 用一句话介绍自己</span>
          <input className="input" maxLength={40} value={intro} placeholder="例如：刚毕业的设计师，周末喜欢往山里跑" onChange={(e) => setIntro(e.target.value)} />
        </label>
        <label className="field">
          <span>2. 你的兴趣（至少 2 个，用「、」分开）</span>
          <input className="input" maxLength={120} value={interests} placeholder="例如：登山、摄影、做饭" onChange={(e) => setInterests(e.target.value)} />
        </label>
        <label className="field">
          <span>3. 想认识什么样的人</span>
          <input className="input" maxLength={60} value={lookingFor} placeholder="例如：周末能一起爬山的朋友" onChange={(e) => setLookingFor(e.target.value)} />
        </label>
        <p className="hint-inline">保存后这份档案就是你对外的样子：别人在大厅只会看到这些，不会看到你和阿澈的聊天。</p>
        {error && (
          <p className="chip chip--coral" role="alert">
            {error}
          </p>
        )}
        <div className="next-actions">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? '生成中…' : '生成档案'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
