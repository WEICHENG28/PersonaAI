import { useEffect, useState } from 'react'
import { Button, Chip } from '@components/ui/Button'
import { Card, CardHead } from '@components/ui/Card'
import { t } from '@i18n/t'
import {
  fetchProfile,
  requestExtractProfile,
  saveShareable,
  type ShareableInput,
  type ShareableView,
} from '@lib/api/friend'
import { InterestsInput, INTERESTS_HINT } from './InterestsInput'

/**
 * http 模式的对外档案：GET /api/profile 显示、PUT /api/profile/shareable 修改并确认、
 * POST /api/profile/extract 用 AI 重新提取（先确认，UX #11）。
 */
export function HttpProfileCard() {
  const [view, setView] = useState<ShareableView | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ShareableInput | null>(null)
  const [busy, setBusy] = useState(false)
  const [askExtract, setAskExtract] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchProfile()
      .then(setView)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '读取档案失败'))
  }, [])

  const run = async (fn: () => Promise<ShareableView>, fallback: string) => {
    setBusy(true)
    setError(null)
    try {
      setView(await fn())
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback)
    } finally {
      setBusy(false)
    }
  }

  const shareable = view?.shareable ?? null
  const startEdit = () => {
    if (!shareable) return
    setDraft({ ...shareable, interests: [...shareable.interests] })
    setEditing(true)
  }
  const extract = () => {
    setAskExtract(false)
    void run(requestExtractProfile, '档案更新失败，稍后再试')
  }

  return (
    <Card>
      <CardHead
        title={t('profile.shareable')}
        right={
          view?.confirmed ? (
            <Chip tone="mint">{t('profile.confirmed')}</Chip>
          ) : shareable ? (
            <Chip tone="coral">{t('profile.pending')}</Chip>
          ) : null
        }
      />
      {error && <p className="login-error">{error}</p>}

      {!shareable && !editing ? (
        <div className="stack">
          <p className="empty">{t('profile.comingSoon')}</p>
          <div className="next-actions">
            <Button small onClick={extract} disabled={busy}>
              {busy ? t('login.loading') : '跟阿澈聊过之后，手动生成档案'}
            </Button>
          </div>
        </div>
      ) : editing && draft ? (
        <div className="stack">
          <label className="field">
            <span>一句话介绍（40 字内）</span>
            <textarea className="input" rows={2} maxLength={40} value={draft.intro} onChange={(e) => setDraft({ ...draft, intro: e.target.value })} />
          </label>
          <label className="field">
            <span>兴趣（{INTERESTS_HINT}，最多 12 项）</span>
            <InterestsInput value={draft.interests} onChange={(interests) => setDraft({ ...draft, interests })} />
          </label>
          <label className="field">
            <span>聊天风格（60 字内）</span>
            <input className="input" maxLength={60} value={draft.chat_style} onChange={(e) => setDraft({ ...draft, chat_style: e.target.value })} />
          </label>
          <label className="field">
            <span>想找什么样的人（60 字内）</span>
            <input className="input" maxLength={60} value={draft.looking_for} onChange={(e) => setDraft({ ...draft, looking_for: e.target.value })} />
          </label>
          <div className="next-actions">
            <Button onClick={() => void run(() => saveShareable(draft), '保存失败，再试一次？')} disabled={busy}>
              {t('profile.saveConfirm')}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(false)}>
              {t('profile.cancelEdit')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="profile-view">
          <p className="profile-intro">{shareable!.intro}</p>
          <div className="chips">
            {shareable!.interests.map((i) => (
              <Chip key={i} tone="well">
                {i}
              </Chip>
            ))}
          </div>
          <p className="profile-style">{shareable!.chat_style}</p>
          {shareable!.looking_for && <p className="profile-style">{shareable!.looking_for}</p>}
          <div className="next-actions">
            <Button small variant="secondary" onClick={startEdit}>
              {t('profile.edit')}
            </Button>
            <Button small variant="secondary" onClick={() => setAskExtract(true)} disabled={busy}>
              {busy ? t('login.loading') : '重新提取'}
            </Button>
            {!view?.confirmed && (
              <Button small onClick={() => void run(() => saveShareable(shareable!), '确认失败，再试一次？')} disabled={busy}>
                {t('profile.saveConfirm')}
              </Button>
            )}
          </div>
          {askExtract && (
            <div className="confirm-inline" role="alertdialog">
              <p>会用 AI 重写你的对外档案，确定吗？</p>
              <div className="next-actions">
                <Button small variant="danger" onClick={extract}>
                  确定重写
                </Button>
                <Button small variant="secondary" onClick={() => setAskExtract(false)}>
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          )}
          {!view?.confirmed && <p className="hint-inline">{t('profile.confirmShareNote')}</p>}
        </div>
      )}
    </Card>
  )
}
