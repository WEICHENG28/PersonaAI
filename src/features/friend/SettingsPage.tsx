import { useNavigate } from 'react-router'
import { Button, Chip } from '@components/ui/Button'
import { Card, CardHead } from '@components/ui/Card'
import { useDemoStore } from '@store/useDemoStore'
import { t } from '@i18n/t'
import { AgentLogPanel } from '@components/AgentLogPanel'
import { isHttpMode, logout as authLogout } from '@lib/api/friend'

/** 画面 12：设置（dev_mode、主动频率、社交 Agent 开关、档位） */
export function SettingsPage() {
  const s = useDemoStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    if (isHttpMode) {
      try {
        await authLogout()
      } catch {
        // session 已失效也清本地
      }
    }
    s.logout()
    navigate('/', { replace: true })
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('settings.title')}</h1>
      </div>

      <div className="stack">
        {/* 桌机双栏：左＝社交 Agent/档位/频率，右＝dev/时间/登出 */}
        <div className="profile-layout">
          <div className="stack">
            {/* 社交 Agent */}
        <Card>
          <CardHead
            title={t('settings.socialAgent')}
            sub={t('settings.socialAgentNote')}
            right={<Chip tone={s.settings.socialAgent ? 'mint' : 'well'}>{s.settings.socialAgent ? '开' : '关'}</Chip>}
          />
          <Button
            small
            variant={s.settings.socialAgent ? 'danger' : 'primary'}
            onClick={() => s.toggleSetting('socialAgent')}
          >
            {s.settings.socialAgent ? '关闭' : '开启'}
          </Button>
          {!s.profile.confirmed && (
            <p className="hint-inline">
              <Button small variant="secondary" onClick={() => navigate('/profile')}>
                {t('settings.socialAgentNote')}
              </Button>
            </p>
          )}
        </Card>

        {/* 档位 */}
        <Card>
          <CardHead title={t('settings.gear')} />
          <div className="gear-opts">
            <button
              className={`gear-opt ${s.settings.gear === 'one-way' ? 'is-on' : ''}`}
              onClick={() => s.setSetting('gear', 'one-way')}
            >
              <strong>{t('settings.gearOneWay')}</strong>
              <span>{t('settings.gearOneWayHint')}</span>
            </button>
            <button
              className={`gear-opt ${s.settings.gear === 'mutual' ? 'is-on' : ''}`}
              onClick={() => s.setSetting('gear', 'mutual')}
            >
              <strong>{t('settings.gearMutual')}</strong>
              <span>{t('settings.gearMutualHint')}</span>
            </button>
          </div>
        </Card>

        {/* 主动频率 */}
        <Card>
          <CardHead title={t('settings.proactive')} />
          <div className="gear-opts">
            {(['off', 'low', 'normal'] as const).map((v) => (
              <button
                key={v}
                className={`gear-opt ${s.settings.proactive === v ? 'is-on' : ''}`}
                onClick={() => s.setSetting('proactive', v)}
              >
                <strong>
                  {v === 'off'
                    ? t('settings.proactiveOff')
                    : v === 'low'
                      ? t('settings.proactiveLow')
                      : t('settings.proactiveNormal')}
                </strong>
              </button>
            ))}
          </div>
        </Card>

        {/* dev_mode 时直接看日志 */}
        {s.settings.devMode && <AgentLogPanel logs={s.taskLogs} />}
          </div>

          <div className="stack">
            {/* 开发者模式 */}
            <Card>
              <CardHead
                title={t('settings.devMode')}
                sub={t('settings.devModeHint')}
                right={<Chip tone={s.settings.devMode ? 'pear' : 'well'}>{s.settings.devMode ? '开' : '关'}</Chip>}
              />
              <Button
                small
                variant={s.settings.devMode ? 'danger' : 'primary'}
                onClick={() => s.toggleSetting('devMode')}
              >
                {s.settings.devMode ? '关闭' : '开启'}
              </Button>
            </Card>

            {/* 人工平均时间 */}
            <Card>
              <CardHead title={t('settings.avgManualTime')} sub={t('settings.avgManualTimeNote')} />
              <input
                className="input"
                type="number"
                min={5}
                max={120}
                value={s.settings.avgManualMin}
                onChange={(e) => s.setSetting('avgManualMin', Number(e.target.value) || 20)}
                style={{ maxWidth: 160 }}
              />
            </Card>

            {/* 账号：登出 */}
            <Card>
              <CardHead title="账号" sub="登出后需重新登录" />
              <Button small variant="danger" onClick={handleLogout}>
                {t('settings.logout')}
              </Button>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
