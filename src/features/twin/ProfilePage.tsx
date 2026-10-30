import { useState } from 'react'
import { Button, Chip } from '@components/ui/Button'
import { Card, CardHead } from '@components/ui/Card'
import { useDemoStore } from '@store/useDemoStore'
import { t } from '@i18n/t'

/** 画面 11：我的档案（对外档案可编辑 + 确认 + 记忆可删） */
export function ProfilePage() {
  const s = useDemoStore()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(s.profile)

  if (!s.profileDraftReady && !s.memories.length && !s.profile.interests.length) {
    return (
      <div className="page">
        <div className="page-head">
          <h1>{t('profile.title')}</h1>
        </div>
        <p className="empty">{t('profile.comingSoon')}</p>
      </div>
    )
  }

  const startEdit = () => {
    setDraft(s.profile)
    setEditing(true)
  }

  const save = () => {
    s.updateProfile(draft)
    setEditing(false)
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('profile.title')}</h1>
        <p>{t('profile.shareableNote')}</p>
      </div>

      <div className="stack">
        {/* 对外档案 */}
        <Card>
          <CardHead
            title={t('profile.shareable')}
            right={
              s.profile.confirmed ? (
                <Chip tone="mint">{t('profile.confirmed')}</Chip>
              ) : (
                <Chip tone="coral">{t('common.comingSoonBadge')}</Chip>
              )
            }
          />
          {!s.profileDraftReady && !editing ? (
            <p className="empty">{t('profile.comingSoon')}</p>
          ) : editing ? (
            <div className="stack">
              <label className="field">
                <span>一句话介绍</span>
                <textarea
                  className="input"
                  rows={2}
                  value={draft.intro}
                  onChange={(e) => setDraft({ ...draft, intro: e.target.value })}
                />
              </label>
              <label className="field">
                <span>兴趣（逗号分隔）</span>
                <input
                  className="input"
                  value={draft.interests.join('、')}
                  onChange={(e) =>
                    setDraft({ ...draft, interests: e.target.value.split(/[、,，]/).filter(Boolean) })
                  }
                />
              </label>
              <label className="field">
                <span>聊天风格</span>
                <input
                  className="input"
                  value={draft.chatStyle}
                  onChange={(e) => setDraft({ ...draft, chatStyle: e.target.value })}
                />
              </label>
              <label className="field">
                <span>MBTI（{t('profile.mbtiBadge')}）</span>
                <input
                  className="input"
                  value={draft.mbti ?? ''}
                  onChange={(e) => setDraft({ ...draft, mbti: e.target.value })}
                />
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
              <div className="chips">
                {s.profile.interests.map((i) => (
                  <Chip key={i} tone="well">
                    {i}
                  </Chip>
                ))}
              </div>
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
              {!s.profile.confirmed && (
                <p className="hint-inline">{t('profile.confirmShareNote')}</p>
              )}
            </div>
          )}
        </Card>

        {/* 说话风格说明（分身模仿用） */}
        <Card>
          <CardHead title={t('profile.styleTitle')} sub={t('profile.styleNote')} />
          <ul className="suggest-list">
            <li>句长：中短句为主</li>
            <li>语气：温和、偶尔冷幽默</li>
            <li>emoji：少量使用</li>
          </ul>
        </Card>

        {/* 它记得的事 */}
        <Card>
          <CardHead title={t('profile.memories')} />
          {s.memories.length === 0 ? (
            <p className="empty">{t('profile.memoriesEmpty')}</p>
          ) : (
            <ul className="mem-list">
              {s.memories.map((m) => (
                <li key={m.id} className="mem">
                  <p>{m.content}</p>
                  <footer>
                    <Chip tone="well">{m.source}</Chip>
                    <button className="mem-del" onClick={() => s.deleteMemory(m.id)}>
                      {t('profile.deleteMemory')}
                    </button>
                  </footer>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
