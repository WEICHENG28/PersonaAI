// C5 代聊结果页（http 模式，真资料）。版面沿用 A 做好的结果页（mutual-badge／fit-list／outline／next-actions），只换资料来源。拥有者：C。
// 只显示我方视角：判定是文字＋走势，没有分数；对方视角的理由与分数后端根本不回。
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ChatBubble } from '@components/ui/ChatBubble'
import { Button, Chip } from '@components/ui/Button'
import { Card, CardHead } from '@components/ui/Card'
import { t } from '@i18n/t'
import type { FitPointView, OutlineView, ResultMessage, ResultView } from '@lib/api/twin'
import { speakerOf, statusChip } from './chatRoomView'
import { HANDOFF_TEXT, takeoverBlockOf, type HandoffRouteState } from './handoffView'
import { groupByRound, RESULT_TEXT, scoreColor, verdictLine } from './resultView'
import { useResult, type ResultState } from './useResult'

/** 同一轮的气泡放在同一组；组本身是直向 flex，气泡的左右对齐（align-self）才有作用。 */
const ROUND_GROUP_STYLE: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }

interface LiveResultProps {
  conversationId: string
}

export function LiveResult({ conversationId }: LiveResultProps) {
  const state = useResult(conversationId)
  const back = useBack()

  if (!state.view) {
    return (
      <div className="page">
        {state.loadError ? (
          <Card className="stack">
            <h1>{RESULT_TEXT.loadFailedTitle}</h1>
            <p>{state.loadError}</p>
            <Button onClick={back}>{RESULT_TEXT.back}</Button>
          </Card>
        ) : (
          <p className="empty">{t('common.loading')}</p>
        )}
      </div>
    )
  }
  return <ResultBody view={state.view} state={state} onSkip={back} />
}

/** 「略过」：回到上一页；直接打开网址（没有上一页）时回历史。 */
function useBack(): () => void {
  const navigate = useNavigate()
  const location = useLocation()
  return () => (location.key === 'default' ? navigate('/history') : navigate(-1))
}

interface ResultBodyProps {
  view: ResultView
  state: ResultState
  onSkip(): void
}

function ResultBody({ view, state, onSkip }: ResultBodyProps) {
  const [showFull, setShowFull] = useState(false)
  // seq 让同一轮再点一次也会重新捲动
  const [jump, setJump] = useState<{ round: number; seq: number } | null>(null)
  const navigate = useNavigate()
  const chip = statusChip(view.status)
  const chatPath = `/chat/${encodeURIComponent(view.conversationId)}`
  const busy = state.continuing || state.takingOver

  const jumpTo = (round: number) => {
    setShowFull(true)
    setJump((j) => ({ round, seq: (j?.seq ?? 0) + 1 }))
  }
  const continueChat = async () => {
    if (await state.continueChat()) setShowFull(true)
  }
  // C6：接手成功后到聊天室，先显示接手卡片
  const takeOverChat = async () => {
    const handoff = await state.takeOver()
    if (handoff) navigate(chatPath, { state: { handoff } satisfies HandoffRouteState })
  }

  return (
    <div className="page">
      {/* 標題和狀態標籤同一行、垂直置中 */}
      <div className="page-head" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-sm)' }}>
        <h1 style={{ fontSize: 'var(--text-2xl)' }}>{t('proxyChat.withWho', { name: view.other.name })}</h1>
        {chip && <Chip tone="coral">{chip}</Chip>}
        {view.mutual && <p style={{ margin: 0, flexBasis: '100%' }}>{t('result.mutualBadgeSub')}</p>}
      </div>

      {view.mutual && (
        <div className="mutual-badge">
          <span className="mutual-badge__in">
            {t('result.mutualBadge')} {RESULT_TEXT.mutualEmoji}
          </span>
        </div>
      )}

      <div className="stack">
        <Card>
          <CardHead
            title={t('result.verdictTitle')}
            right={
              typeof view.verdict?.score === 'number' ? (
                <div style={{ textAlign: 'right', lineHeight: 1 }} aria-label={`我方契合度 ${view.verdict.score} 分`}>
                  {/* 大字＋依分數區間上色（80+ 深綠、65–79 綠、50–64 琥珀橘、50 以下紅） */}
                  <strong style={{ fontSize: 'calc(var(--text-2xl) * 1.6)', fontWeight: 800, color: scoreColor(view.verdict.score) }}>
                    {view.verdict.score}
                  </strong>
                  <span style={{ fontSize: 'var(--text-md)', color: 'var(--color-muted)' }}> / 100</span>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginTop: 'var(--space-2xs)' }}>我方契合度</p>
                </div>
              ) : undefined
            }
          />
          <div className="verdict-final">
            <p className="verdict-note">{verdictLine(view.verdict)}</p>
            <p className="verdict-hidden">{t('result.oppVerdictHidden')}</p>
          </div>
        </Card>

        {view.fitPoints.length > 0 && <WhyFit points={view.fitPoints} onJump={jumpTo} />}

        <OutlineCard outline={view.outline} />

        <FullLog messages={view.messages} myUserId={view.me.userId} show={showFull} onToggle={() => setShowFull((v) => !v)} jump={jump} />

        <Card>
          <CardHead title={t('result.nextTitle')} />
          <div className="next-actions">
            <TakeOverButton
              view={view}
              takingOver={state.takingOver}
              disabled={busy}
              onTakeOver={() => void takeOverChat()}
              onGoChat={() => navigate(chatPath)}
            />
            <Button
              variant="secondary"
              onClick={() => void continueChat()}
              disabled={view.continueBlock !== null || busy}
              title={view.continueBlock ?? undefined}
            >
              {t('result.continueTwin')}
            </Button>
            <Button variant="secondary" onClick={onSkip}>
              {t('result.skip')}
            </Button>
          </div>
          {(state.notice ?? view.continueBlock) && (
            // 按鈕底下有立體陰影，文字要留距離才不會黏在按鈕上
            <p className="verdict-hidden" role="status" style={{ marginTop: 'var(--space-md)' }}>
              {state.notice ?? view.continueBlock}
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}

interface TakeOverButtonProps {
  view: ResultView
  takingOver: boolean
  disabled: boolean
  onTakeOver(): void
  onGoChat(): void
}

/** 「本人接手」（C6）；已经本人接手就改成「回到聊天室」，对话结束则停用。 */
function TakeOverButton({ view, takingOver, disabled, onTakeOver, onGoChat }: TakeOverButtonProps) {
  const block = takeoverBlockOf(view)
  if (view.status !== 'ended' && view.me.controller === 'human') return <Button onClick={onGoChat}>{HANDOFF_TEXT.goChat}</Button>
  return (
    <Button onClick={onTakeOver} disabled={block !== null || disabled} title={block ?? undefined}>
      {takingOver ? HANDOFF_TEXT.taking : t('result.takeOver')}
    </Button>
  )
}

function WhyFit({ points, onJump }: { points: FitPointView[]; onJump(round: number): void }) {
  return (
    <Card>
      <CardHead title={t('result.whyFit')} sub={t('result.whyFitHint')} />
      <ul className="fit-list">
        {points.map((f, i) => (
          <li key={`${f.round}-${i}`}>
            <p className="verdict-note">{RESULT_TEXT.concern(f.concern)}</p>
            <p>{f.evidence}</p>
            <button type="button" className="fit-jump" onClick={() => onJump(f.round)}>
              {t('result.roundTag', { n: f.round })} · {t('result.jumpToRound')}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function OutlineCard({ outline }: { outline: OutlineView | null }) {
  return (
    <Card>
      <CardHead title={t('result.outline')} />
      {outline ? (
        <div className="outline">
          <section>
            <h3>{t('result.outlineTopics')}</h3>
            <div className="chips">
              {outline.topics.length === 0 && <span>{RESULT_TEXT.outlineEmpty}</span>}
              {outline.topics.map((x, i) => (
                <Chip key={`${i}-${x}`} tone="well">
                  {x}
                </Chip>
              ))}
            </div>
          </section>
          <OutlineList title={t('result.outlineFit')} items={outline.fits} />
          <OutlineList title={t('result.outlineFriction')} items={outline.frictions} />
          <OutlineList title={t('result.outlineHighlight')} items={outline.highlights} />
        </div>
      ) : (
        <p className="empty">{RESULT_TEXT.outlinePending}</p>
      )}
    </Card>
  )
}

function OutlineList({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p>{RESULT_TEXT.outlineEmpty}</p>
      ) : (
        <ul>
          {items.map((x, i) => (
            <li key={`${i}-${x}`}>{x}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

interface FullLogProps {
  messages: ResultMessage[]
  myUserId: string
  show: boolean
  onToggle(): void
  jump: { round: number; seq: number } | null
}

/** 完整对话纪录：预设收起；点「第 n 轮」会展开并捲到那一轮、标亮。 */
function FullLog({ messages, myUserId, show, onToggle, jump }: FullLogProps) {
  const groupRefs = useRef(new Map<number, HTMLDivElement>())

  useEffect(() => {
    if (!show || !jump) return
    groupRefs.current.get(jump.round)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [show, jump])

  return (
    <Card>
      <CardHead
        title={t('result.fullLog')}
        right={
          <Button small variant="secondary" onClick={onToggle}>
            {show ? t('result.fullLogHide') : t('result.fullLogShow')}
          </Button>
        }
      />
      {show && (
        <div className="chat">
          {messages.length === 0 && <p className="empty">{RESULT_TEXT.logEmpty}</p>}
          {groupByRound(messages).map((g) => (
            <div
              key={g.round}
              ref={(el) => {
                if (el) groupRefs.current.set(g.round, el)
                else groupRefs.current.delete(g.round)
              }}
              className={jump?.round === g.round ? 'log-focus' : undefined}
              style={ROUND_GROUP_STYLE}
            >
              {g.messages.map((m) => (
                <ChatBubble
                  key={m.id}
                  speaker={speakerOf(m, myUserId)}
                  aiChatting={m.is_ai}
                  privacyRewrite={m.guard_rewritten}
                  roundTag={t('proxyChat.round', { n: m.round })}
                >
                  {m.content}
                </ChatBubble>
              ))}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
