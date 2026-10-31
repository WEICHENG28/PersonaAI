import { useEffect, useState } from 'react'
import { Chip } from '@components/ui/Button'
import { Card } from '@components/ui/Card'
import { api } from '@lib/api'
import type { Candidate } from '@lib/api/types'
import { isLiveChat } from '@lib/api/twin'
import { t } from '@i18n/t'
import { LiveLobby } from './components/LiveLobby'
import { LobbyAIFloating } from './components/LobbyAIFloating'
import { fitFromPercent, fitText } from './components/lobbyView'

/** 画面 10：大厅（候选人卡片 + fish Rive + 大厅 AI 助手）。http 模式是真资料（C9／C10），mock 模式照旧跑 demo。 */
export function LobbyPage() {
  return isLiveChat ? <LiveLobby /> : <DemoLobby />
}

/** mock 模式：A 的 demo 假资料（助手浮动按钮提供）。 */
function DemoLobby() {
  return (
    <div className="page">
      {/* 候选人卡片 */}
      <DemoCandidates />
      {/* 右下角浮动 AI 助手 */}
      <LobbyAIFloating />
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
              {/* mock 资料一定有 fitPredict；data-fit 给 CSS 上色（差异较大＝深橘） */}
              <p className="cand-fit" data-fit={fitFromPercent(c.fitPredict)}>
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
