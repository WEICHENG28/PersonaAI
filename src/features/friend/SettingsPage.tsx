import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@components/ui/Button'
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
  const [dailyLimitDraft, setDailyLimitDraft] = useState(10)
  const dailyLimit = isHttpMode ? (httpSettings?.daily_chat_limit ?? 10) : dailyLimitDraft
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
    // 未确认对外档案：先提示，再跳去档案页（不静默跳页）
    if (!shareableConfirmed && !socialAgent) {
      setSaveError('请先到「我的档案」确认对外档案，才能开启社交 Agent')
      window.setTimeout(() => navigate('/profile'), 1200)
      return
    }
    setSaveError(null)
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

  return (
    <div className="page">
      {saving && <span className="hint-inline">保存中…</span>}
      {saveError && <span className="hint-inline" style={{ color: 'var(--c-err)' }}>{saveError}</span>}

      {/* 六張卡片：桌機左三右三、一樣大小對齊（手機一欄）；登出放最下面一整條 */}
      <div className="settings-grid">
        {/* 社交 Agent */}
        <Card>
          <CardHead
            title={t('settings.socialAgent')}
            sub={t('settings.socialAgentNote')}
            right={
              <Button small variant={socialAgent ? 'danger' : 'primary'} onClick={toggleSocialAgent} disabled={saving}>
                {socialAgent ? '点击关闭' : '点击开启'}
              </Button>
            }
          />
          <p className="hint-inline">
            {socialAgent
              ? '已开启：分身和大厅会使用你的对外档案，可随时关闭'
              : shareableConfirmed
                ? '关闭中：开启后分身和大厅会使用你的对外档案'
                : '请先到「我的档案」确认对外档案，才能开启'}
          </p>
        </Card>

        {/* 档位 */}
        <Card>
          <CardHead title={t('settings.gear')} />
          <div className="gear-opts">
            <button className={`gear-opt ${gear === 'one-way' ? 'is-on' : ''}`} onClick={() => setGear('one-way')} disabled={saving}>
              <strong>{t('settings.gearOneWay')}</strong>
              <span>{t('settings.gearOneWayHint')}</span>
            </button>
            <button className={`gear-opt ${gear === 'mutual' ? 'is-on' : ''}`} onClick={() => setGear('mutual')} disabled={saving}>
              <strong>{t('settings.gearMutual')}</strong>
              <span>{t('settings.gearMutualHint')}</span>
            </button>
          </div>
        </Card>

        {/* 每日代聊上限（mock 模式只是示意，不会保存） */}
        <Card>
          <CardHead title="每日代聊上限" sub="社交 Agent 每天最多帮你代聊几场（1–20）" />
          <input
            className="input"
            type="number"
            min={1}
            max={20}
            value={dailyLimit}
            onChange={(e) => {
              const v = Math.max(1, Math.min(20, Number(e.target.value) || 10))
              setDailyLimitDraft(v)
              setHttpSettings((prev) => (prev ? { ...prev, daily_chat_limit: v } : prev))
            }}
            onBlur={(e) => {
              const v = Math.max(1, Math.min(20, Number(e.target.value) || 10))
              if (isHttpMode && v !== (httpSettings?.daily_chat_limit ?? 10)) void httpSave({ daily_chat_limit: v })
            }}
            style={{ maxWidth: 120 }}
          />
        </Card>

        {/* 主动频率：三颗按钮固定同一行（手机也并排） */}
        <Card>
          <CardHead title={t('settings.proactive')} />
          <div className="gear-opts gear-opts--row">
            {(['off', 'low', 'normal'] as const).map((v) => (
              <button key={v} className={`gear-opt ${proactive === v ? 'is-on' : ''}`} onClick={() => setProactive(v)} disabled={saving}>
                <strong>{v === 'off' ? t('settings.proactiveOff') : v === 'low' ? t('settings.proactiveLow') : t('settings.proactiveNormal')}</strong>
              </button>
            ))}
          </div>
        </Card>

        {/* 对外档案：社交 Agent 要先确认档案，放一个直接入口 */}
        <Card>
          <CardHead
            title="对外档案"
            sub="分身和大厅只会用这份档案"
            right={
              <Button small variant="secondary" onClick={() => navigate('/profile')}>
                去「我的档案」
              </Button>
            }
          />
          <p className="hint-inline">{shareableConfirmed ? '已确认，可以对外使用' : '还没确认：确认后才能开启社交 Agent'}</p>
        </Card>

        {/* 开发者模式 */}
        <Card>
          <CardHead
            title={t('settings.devMode')}
            sub={t('settings.devModeHint')}
            right={
              <Button small variant={devMode ? 'danger' : 'primary'} onClick={toggleDevMode} disabled={saving}>
                {devMode ? '点击关闭' : '点击开启'}
              </Button>
            }
          />
        </Card>
      </div>

      {/* dev_mode 时显示日志 */}
      {devMode && <AgentLogPanel logs={s.taskLogs} />}

      {/* 账号：登出（最下面一整条） */}
      <Button block variant="danger" onClick={handleLogout} style={{ marginTop: 'var(--space-lg)' }}>
        {t('settings.logout')}
      </Button>
    </div>
  )
}
