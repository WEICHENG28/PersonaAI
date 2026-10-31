import { useNavigate } from 'react-router'
import { Button } from '@components/ui/Button'
import { Card, CardHead } from '@components/ui/Card'
import { GearIcon } from '@components/ui/Icons'
import { t } from '@i18n/t'
import { isHttpMode } from '@lib/api/friend'
import { FunLabelsSection } from './FunLabelsSection'
import { HttpProfileCard } from './HttpProfileSection'
import { MemoryList } from './MemoryList'
import { MockProfileCard } from './MockProfileCard'
import { useMemories } from './useMemories'

/**
 * 画面 11：我的档案（对外档案可编辑 + 确认 + 记忆可删）。手机底栏的「我的」＝档案＋设置入口。
 * http 模式：档案走 /api/profile，记忆走 /api/memory；mock 模式：demo store。
 */
export function ProfilePage() {
  const navigate = useNavigate()
  const memories = useMemories()

  return (
    <div className="page">
      <div className="page-head page-head--row">
        <div>
          <h1>{t('profile.title')}</h1>
          <p>{t('profile.shareableNote')}</p>
        </div>
        <Button small variant="secondary" onClick={() => navigate('/settings')} aria-label={t('nav.settings')}>
          <GearIcon size={16} /> {t('nav.settings')}
        </Button>
      </div>

      {/* 桌机双栏：档案+说话风格（左）／它记得的事（右） */}
      <div className="profile-layout">
        <div className="stack">
          {isHttpMode ? <HttpProfileCard /> : <MockProfileCard />}

          {/* 说话风格说明（分身模仿用） */}
          <Card>
            <CardHead title={t('profile.styleTitle')} sub={t('profile.styleNote')} />
            <ul className="suggest-list">
              <li>句长：中短句为主</li>
              <li>语气：温和、偶尔冷幽默</li>
              <li>emoji：少量使用</li>
            </ul>
          </Card>
        </div>

        <div className="stack">
          <Card>
            <CardHead title={t('profile.memories')} />
            <MemoryList state={memories} />
          </Card>
          {/* A9：娱乐标签（P2，只在 http 模式显示） */}
          <FunLabelsSection />
        </div>
      </div>
    </div>
  )
}
