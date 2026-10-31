import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, Chip } from '@components/ui/Button'
import { Card } from '@components/ui/Card'
import { RiveAvatar } from '@components/ui/RiveAvatar'
import { useDemoStore } from '@store/useDemoStore'
import type { Candidate } from '@lib/api/types'
import { t } from '@i18n/t'
import { candidates } from '@demo/fixtures'
import { answerLobbyQuestion } from '@demo/lobbyHelper'
import { fitFromPercent, fitText } from './components/lobbyView'
import { DEMO_HUMAN_CHAT_IDS } from './DemoHumanChat'

/** 助手问答保留几组 */
const HISTORY_KEEP = 3
/** 假装查询的时间 */
const ASK_DELAY_MS = 600
/** demo 只开放代聊的对象 */
const PROXY_TARGET = 'c-lin'

interface QA {
  q: string
  a: string
}

/** mock 模式大厅：候选人卡片可以「我自己聊」「派分身去聊」（UX #15），助手依兴趣／风格比对（UX #26）。 */
export function DemoLobby() {
  const hasRun = useDemoStore((s) => s.task !== null || s.proxyTick > 0)
  const failedName = useDemoStore((s) => s.failedMatch.withName)
  // 历史里判定不合适的人：标示且不推荐
  const excluded = hasRun ? [failedName] : []

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('lobby.title')}</h1>
        <p>{t('lobby.subtitle')}</p>
      </div>
      <DemoAssistant excluded={excluded} />
      <h2 className="section-title">{t('lobby.candidatesTitle')}</h2>
      <div className="lobby-grid">
        {candidates.map((c) => (
          <DemoCandidateCard key={c.id} candidate={c} pastMismatch={excluded.includes(c.name)} />
        ))}
      </div>
      <p className="mbti-note">{t('lobby.mbtiNote')}</p>
    </div>
  )
}

function DemoAssistant({ excluded }: { excluded: string[] }) {
  const [question, setQuestion] = useState('')
  const [history, setHistory] = useState<QA[]>([])
  const [asking, setAsking] = useState(false)

  const ask = () => {
    const q = question.trim()
    if (!q || asking) return
    setAsking(true)
    setQuestion('')
    setTimeout(() => {
      setHistory((h) => [...h, { q, a: answerLobbyQuestion(q, candidates, excluded) }].slice(-HISTORY_KEEP))
      setAsking(false)
    }, ASK_DELAY_MS)
  }

  return (
    <Card className="helper-card">
      <div className="helper-head">
        <RiveAvatar name="fish" size={64} />
        <div>
          <strong>{t('lobby.twinHelper')}</strong>
          <p className="helper-intro">{t('lobby.helperIntro')}</p>
        </div>
      </div>
      {history.map((qa, i) => (
        <div key={`${i}-${qa.q}`} className="stack helper-qa">
          <p className="helper-q">{qa.q}</p>
          <p className="helper-ans">{qa.a}</p>
        </div>
      ))}
      {asking && <p className="helper-ans">{t('lobby.helperTyping')}</p>}
      <div className="chat-input">
        <input
          className="input"
          placeholder={t('lobby.helperPlaceholder')}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && ask()}
        />
        <Button small onClick={ask} disabled={asking || !question.trim()}>
          {t('lobby.helperSend')}
        </Button>
      </div>
    </Card>
  )
}

function DemoCandidateCard({ candidate: c, pastMismatch }: { candidate: Candidate; pastMismatch: boolean }) {
  const navigate = useNavigate()
  const s = useDemoStore()
  const [notice, setNotice] = useState<string | null>(null)
  const chatId = c.id.replace(/^c-/, '')

  const chatMyself = () => {
    if (c.id === PROXY_TARGET) {
      s.takeOver()
      navigate('/chat/lin')
    } else if (DEMO_HUMAN_CHAT_IDS[chatId]) {
      navigate(`/chat/${chatId}`)
    } else {
      setNotice('演示只开放和林小山、陈岭、周予安聊天')
    }
  }

  const sendTwin = () => {
    if (c.id !== PROXY_TARGET) {
      setNotice('演示只开放和林小山的代聊')
      return
    }
    // 先把控制权交回分身，再开始（或接着跑）代聊；startProxy 是幂等的
    if (s.takenOver) s.handBack()
    s.startProxy()
    navigate('/chat/lin')
  }

  return (
    <Card className="cand-card">
      <div className="cand-head">
        <strong>{c.name}</strong>
        <Chip tone={c.status === 'online' ? 'mint' : 'ink'}>{c.status === 'online' ? t('lobby.online') : t('lobby.proxying')}</Chip>
      </div>
      {pastMismatch && <Chip tone="coral">{t('lobby.pastMismatch')}</Chip>}
      <p className="cand-intro">{c.intro}</p>
      <div className="chips">
        {c.interests.map((i) => (
          <Chip key={i} tone="well">
            {i}
          </Chip>
        ))}
      </div>
      <p className="cand-style">{c.chatStyle}</p>
      <p className="cand-fit">
        {t('lobby.fitPredict')} <b>{fitText(fitFromPercent(c.fitPredict))}</b>
      </p>
      <footer className="cand-foot">
        <Chip tone="paper" className="cand-mbti">
          {c.mbti} · {t('lobby.mbtiBadge')}
        </Chip>
      </footer>
      <div className="chips">
        <Button small onClick={chatMyself}>
          {t('lobby.chatMyself')}
        </Button>
        <Button small variant="secondary" onClick={sendTwin}>
          {t('lobby.sendTwin')}
        </Button>
      </div>
      {notice && (
        <p className="cand-style" role="status">
          {notice}
        </p>
      )}
    </Card>
  )
}
