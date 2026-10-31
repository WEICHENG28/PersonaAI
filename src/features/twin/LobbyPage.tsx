import { useEffect, useState } from 'react'
import { Button, Chip } from '@components/ui/Button'
import { Card } from '@components/ui/Card'
import { RiveAvatar } from '@components/ui/RiveAvatar'
import { api } from '@lib/api'
import type { Candidate } from '@lib/api/types'
import { isLiveChat } from '@lib/api/twin'
import { t } from '@i18n/t'
import { LiveLobby } from './components/LiveLobby'
import { fitFromPercent, fitText } from './components/lobbyView'

/** 画面 10：大厅（候选人卡片 + fish Rive + 大厅 AI 助手）。http 模式的候选人是真资料（C9），助手还是 demo（C10）。 */
export function LobbyPage() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)

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
      {isLiveChat ? <LiveLobby /> : <DemoCandidates />}
      <p className="mbti-note">{t('lobby.mbtiNote')}</p>
    </div>
  )
}

/** mock 模式的候选人（demo 假资料）；AI 预估显示成文字，不显示数字。 */
function DemoCandidates() {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)

  useEffect(() => {
    api.getLobby().then(setCandidates)
  }, [])

  return (
    <>
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
              <p className="cand-fit">
                {t('lobby.fitPredict')} <b>{fitText(fitFromPercent(c.fitPredict))}</b>
              </p>
              <footer className="cand-foot">
                <Chip tone="paper" className="cand-mbti">
                  {c.mbti} · {t('lobby.mbtiBadge')}
                </Chip>
              </footer>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
