import { useEffect, useState } from 'react'
import { Button, Chip } from '@components/ui/Button'
import { Card } from '@components/ui/Card'
import { RiveAvatar } from '@components/ui/RiveAvatar'
import { api } from '@lib/api'
import type { Candidate } from '@lib/api/types'
import { isLiveChat } from '@lib/api/twin'
import { t } from '@i18n/t'
import { LiveLobby } from './components/LiveLobby'
import { FIT_TEXT, fitOfPercent } from './components/lobbyView'

/** 画面 10：大厅（候选人卡片 + fish Rive + 大厅 AI 助手）。http 模式用真的候选人（C9／C10）。 */
export function LobbyPage() {
  return isLiveChat ? <LiveLobby /> : <DemoLobby />
}

/** mock 模式：照 A 的 demo 假资料。 */
function DemoLobby() {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    api.getLobby().then(setCandidates)
  }, [])

  const ask = async () => {
    if (!question.trim() || asking) return
    setAsking(true)
    setAnswer(null)
    const a = await api.askLobbyHelper(question.trim())
    setAnswer(a)
    setAsking(false)
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('lobby.title')}</h1>
        <p>{t('lobby.subtitle')}</p>
      </div>

      {/* 大厅助手 */}
      <Card className="helper-card">
        <div className="helper-head">
          <RiveAvatar name="fish" size={64} />
          <div>
            <strong>{t('lobby.twinHelper')}</strong>
            <p className="helper-intro">{t('lobby.helperIntro')}</p>
          </div>
        </div>
        <div className="chat-input">
          <input
            className="input"
            placeholder={t('lobby.helperPlaceholder')}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ask()}
          />
          <Button small onClick={ask} disabled={asking || !question.trim()}>
            {t('lobby.helperSend')}
          </Button>
        </div>
        {asking && <p className="helper-ans">{t('lobby.helperTyping')}</p>}
        {answer && <p className="helper-ans">{answer}</p>}
      </Card>

      {/* 候选人卡片 */}
      <h2 className="section-title">{t('lobby.candidatesTitle')}</h2>
      {!candidates ? (
        <p className="empty">{t('common.loading')}</p>
      ) : (
        <div className="lobby-grid">
          {candidates.map((c) => (
            <Card key={c.id} className="cand-card">
              <div className="cand-head">
                <strong>{c.name}</strong>
                <Chip tone={c.status === 'online' ? 'mint' : 'ink'}>
                  {c.status === 'online' ? t('lobby.online') : t('lobby.proxying')}
                </Chip>
              </div>
              <p className="cand-intro">{c.intro}</p>
              <div className="chips">
                {c.interests.map((i) => (
                  <Chip key={i} tone="well">
                    {i}
                  </Chip>
                ))}
              </div>
              <p className="cand-style">{c.chatStyle}</p>
              <footer className="cand-foot">
                <span className="cand-fit">
                  {t('lobby.fitPredict')} <b>{FIT_TEXT[fitOfPercent(c.fitPredict)]}</b>
                </span>
                <Chip tone="paper" className="cand-mbti">
                  {c.mbti} · {t('lobby.mbtiBadge')}
                </Chip>
              </footer>
            </Card>
          ))}
        </div>
      )}
      <p className="mbti-note">{t('lobby.mbtiNote')}</p>
    </div>
  )
}
