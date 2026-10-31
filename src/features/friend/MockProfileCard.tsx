import { useState } from 'react'
import { Button, Chip } from '@components/ui/Button'
import { Card, CardHead } from '@components/ui/Card'
import { useDemoStore } from '@store/useDemoStore'
import { t } from '@i18n/t'
import { InterestsInput, INTERESTS_HINT } from './InterestsInput'

/** mock 模式的对外档案：聊天产生记忆前显示「聊几句后生成草稿」，不预填假资料（UX #33）。 */
export function MockProfileCard() {
  const s = useDemoStore()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(s.profile)

  const startEdit = () => {
    setDraft(s.profile)
    setEditing(true)
  }

  const save = () => {
    s.updateProfile(draft)
    s.confirmProfile()
    setEditing(false)
  }

  return (
    <Card>
      <CardHead
        title={t('profile.shareable')}
        right={
          s.profile.confirmed ? (
            <Chip tone="mint">{t('profile.confirmed')}</Chip>
          ) : (
            s.profileDraftReady && <Chip tone="coral">{t('profile.pending')}</Chip>
          )
        }
      />
      {!s.profileDraftReady && !editing ? (
        <p className="empty">{t('profile.waitDraft')}</p>
      ) : editing ? (
        <div className="stack">
          <label className="field">
            <span>一句话介绍</span>
            <textarea className="input" rows={2} value={draft.intro} onChange={(e) => setDraft({ ...draft, intro: e.target.value })} />
          </label>
          <label className="field">
            <span>兴趣（{INTERESTS_HINT}）</span>
            <InterestsInput value={draft.interests} onChange={(interests) => setDraft({ ...draft, interests })} />
          </label>
          <label className="field">
            <span>聊天风格</span>
            <input className="input" value={draft.chatStyle} onChange={(e) => setDraft({ ...draft, chatStyle: e.target.value })} />
          </label>
          <label className="field">
            <span>MBTI（{t('profile.mbtiBadge')}）</span>
            <input className="input" value={draft.mbti ?? ''} onChange={(e) => setDraft({ ...draft, mbti: e.target.value })} />
          </label>
          <div className="next-actions">
            <Button onClick={save}>{t('profile.saveConfirm')}</Button>
            <Button variant="secondary" onClick={() => setEditing(false)}>
              {t('profile.cancelEdit')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="profile-view">
          <p className="profile-intro">{s.profile.intro}</p>
          {s.profile.interests.length > 0 && (
            <div className="chips">
              {s.profile.interests.map((i) => (
                <Chip key={i} tone="well">
                  {i}
                </Chip>
              ))}
            </div>
          )}
          <p className="profile-style">{s.profile.chatStyle}</p>
          {s.profile.mbti && (
            <Chip tone="paper">
              {s.profile.mbti} · {t('lobby.mbtiBadge')}
            </Chip>
          )}
          <div className="next-actions">
            <Button small variant="secondary" onClick={startEdit}>
              {t('profile.edit')}
            </Button>
            {!s.profile.confirmed && (
              <Button small onClick={s.confirmProfile}>
                {t('profile.saveConfirm')}
              </Button>
            )}
          </div>
          {!s.profile.confirmed && <p className="hint-inline">{t('profile.confirmShareNote')}</p>}
        </div>
      )}
    </Card>
  )
}
