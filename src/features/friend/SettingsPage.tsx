import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router'
import { Button, Chip } from '@components/ui/Button'
import { Card, CardHead } from '@components/ui/Card'
import { useDemoStore } from '@store/useDemoStore'
import { t } from '@i18n/t'
import { AgentLogPanel } from '@components/AgentLogPanel'
import {
  isHttpMode,
  logout as authLogout,
  fetchSettings,
  saveSettings,
  type UserSettings,
  type SettingsPatch,
} from '@lib/api/friend'

/** 画面 12：设置（dev_mode、主动频率、社交 Agent 开关、档位）。
 *  http 模式：load on mount + 每次点击保存到 PUT /api/settings。
 *  mock 模式：纯 demo store，不打 API。
 */
export function SettingsPage() {
  const s = useDemoStore()
  const navigate = useNavigate()

  // http 模式：从 API 加载的设定（null = 加载中或 mock）
  const [httpSettings, setHttpSettings] = useState<UserSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // 加载设定（http 模式）
  useEffect(() => {
    if (!isHttpMode) return
    fetchSettings().then((data) => {
      if (data) setHttpSettings(data)
    }).catch(console.error)
  }, [])

  /** 保存单个字段到后端，同步更新本地 state */
  const httpSave = useCallback(async (patch: SettingsPatch) => {
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await saveSettings(patch)
      setHttpSettings(updated)
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : '保存失败，请再试一次')
    } finally {
      setSaving(false)
    }
  }, [])

  // 辅助：读取当前值（http 模式用 httpSettings，mock 模式用 demo store）
  const devMode = isHttpMode ? (httpSettings?.dev_mode ?? false) : s.settings.devMode
  const proactive = isHttpMode ? (httpSettings?.proactive_frequency ?? 'normal') : s.settings.proactive
  const socialAgent = isHttpMode ? (httpSettings?.social_agent_enabled ?? false) : s.settings.socialAgent
  const gear = isHttpMode ? (httpSettings?.match_tier === 'one_way' ? 'one-way' : 'mutual') : s.settings.gear
  const avgMin = isHttpMode ? (httpSettings?.manual_minutes_per_chat ?? 20) : s.settings.avgManualMin
  const shareableConfirmed = isHttpMode ? (httpSettings?.shareable_confirmed ?? false) : s.profile.confirmed

  const handleLogout = async () => {
    if (isHttpMode) {
      try { await authLogout() } catch { /* session 已失效也清本地 */ }
    }
    s.logout()
    navigate('/', { replace: true })
  }

  const toggleDevMode = () => {
    if (isHttpMode) { void httpSave({ dev_mode: !devMode }) }
    else { s.toggleSetting('devMode') }
  }

  const toggleSocialAgent = () => {
    if (!shareableConfirmed && !socialAgent) {
      navigate('/profile')
      return
    }
    if (isHttpMode) { void httpSave({ social_agent_enabled: !socialAgent }) }
    else { s.toggleSetting('socialAgent') }
  }

  const setGear = (v: 'one-way' | 'mutual') => {
    if (isHttpMode) { void httpSave({ match_tier: v === 'one-way' ? 'one_way' : 'mutual' }) }
    else { s.setSetting('gear', v) }
  }

  const setProactive = (v: 'off' | 'low' | 'normal') => {
    if (isHttpMode) { void httpSave({ proactive_frequency: v }) }
    else { s.setSetting('proactive', v) }
  }

  const setAvgMin = (v: number) => {
    if (isHttpMode) { void httpSave({ manual_minutes_per_chat: v }) }
    else { s.setSetting('avgManualMin', v) }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('settings.title')}</h1>
        {saving && <span className="hint-inline">保存中…</span>}
        {saveError && <span className="hint-inline" style={{ color: 'var(--c-err)' }}>{saveError}</span>}
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
                right={<Chip tone={socialAgent ? 'mint' : 'well'}>{socialAgent ? '开' : '关'}</Chip>}
              />
              {!shareableConfirmed && !socialAgent && (
                <p className="hint-inline">请先在「档案」页确认对外档案，才能开启</p>
              )}
              {shareableConfirmed && socialAgent && (
                <p className="hint-inline">分身和大厅会使用你的对外档案，可随时关闭</p>
              )}
              <Button
                small
                variant={socialAgent ? 'danger' : 'primary'}
                onClick={toggleSocialAgent}
                disabled={saving}
              >
                {socialAgent ? '关闭' : '开启'}
              </Button>
            </Card>

            {/* 档位 */}
            <Card>
              <CardHead title={t('settings.gear')} />
              <div className="gear-opts">
                <button
                  className={`gear-opt ${gear === 'one-way' ? 'is-on' : ''}`}
                  onClick={() => setGear('one-way')}
                  disabled={saving}
                >
                  <strong>{t('settings.gearOneWay')}</strong>
                  <span>{t('settings.gearOneWayHint')}</span>
                </button>
                <button
                  className={`gear-opt ${gear === 'mutual' ? 'is-on' : ''}`}
                  onClick={() => setGear('mutual')}
                  disabled={saving}
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
                    className={`gear-opt ${proactive === v ? 'is-on' : ''}`}
                    onClick={() => setProactive(v)}
                    disabled={saving}
                  >
                    <strong>
                      {v === 'off' ? t('settings.proactiveOff') : v === 'low' ? t('settings.proactiveLow') : t('settings.proactiveNormal')}
                    </strong>
                  </button>
                ))}
              </div>
            </Card>

            {/* dev_mode 时显示日志 */}
            {devMode && <AgentLogPanel logs={s.taskLogs} />}
          </div>

          <div className="stack">
            {/* 开发者模式 */}
            <Card>
              <CardHead
                title={t('settings.devMode')}
                sub={t('settings.devModeHint')}
                right={<Chip tone={devMode ? 'pear' : 'well'}>{devMode ? '开' : '关'}</Chip>}
              />
              <Button
                small
                variant={devMode ? 'danger' : 'primary'}
                onClick={toggleDevMode}
                disabled={saving}
              >
                {devMode ? '关闭' : '开启'}
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
                value={avgMin}
                onChange={(e) => setAvgMin(Number(e.target.value) || 20)}
                onBlur={(e) => {
                  if (isHttpMode) void httpSave({ manual_minutes_per_chat: Number(e.target.value) || 20 })
                }}
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
