import { useEffect, useState } from 'react'
import { Button, Chip } from '@components/ui/Button'
import { Card, CardHead } from '@components/ui/Card'
import { useDemoStore } from '@store/useDemoStore'
import { t } from '@i18n/t'
import {
  fetchProfile,
  saveShareable,
  requestExtractProfile,
  type ShareableView,
  type ShareableInput,
} from '@lib/api/friend'

/**
 * 画面 11：我的档案（对外档案可编辑 + 确认 + 记忆可删）。
 * http 模式：GET /api/profile 显示、PUT /api/profile/shareable 确认、POST /api/profile/extract 手动更新。
 * mock 模式：照旧 demo store（假档案）。
 */
export function ProfilePage() {
  if (isHttpModeCached()) {
    return <HttpProfileSection memoriesSection={<MemoriesSection />} />
  }

  // ── mock 模式（demo store，行为不变） ──
  return <MockProfileSection />
}

/** http 模式与否在模块加载时固定（跟 LoginPage 一致的判断方式）。 */
function isHttpModeCached() {
  return import.meta.env.VITE_API_MODE === 'http'
}

// ───────────────────────── http 模式 ─────────────────────────

function HttpProfileSection({ memoriesSection }: { memoriesSection: React.ReactNode }) {
  const [view, setView] = useState<ShareableView | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ShareableInput | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try {
      setError(null)
      const v = await fetchProfile()
      setView(v)
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取档案失败')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const startEdit = () => {
    if (!view?.shareable) return
    setDraft({ ...view.shareable, interests: [...view.shareable.interests] })
    setEditing(true)
  }

  const save = async () => {
    if (!draft) return
    setBusy(true)
    setError(null)
    try {
      const v = await saveShareable(draft)
      setView(v)
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，再试一次？')
    } finally {
      setBusy(false)
    }
  }

  const extract = async () => {
    setBusy(true)
    setError(null)
    try {
      const v = await requestExtractProfile()
      setView(v)
    } catch (e) {
      setError(e instanceof Error ? e.message : '档案更新失败，稍后再试')
    } finally {
      setBusy(false)
    }
  }

  const shareable = view?.shareable ?? null

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('profile.title')}</h1>
        <p>{t('profile.shareableNote')}</p>
      </div>

      <div className="profile-layout">
        <div className="stack">
          {/* 对外档案 */}
          <Card>
            <CardHead
              title={t('profile.shareable')}
              right={
                view?.confirmed ? (
                  <Chip tone="mint">{t('profile.confirmed')}</Chip>
                ) : shareable ? (
                  <Chip tone="coral">{t('common.comingSoonBadge')}</Chip>
                ) : null
              }
            />
            {error && <p className="login-error">{error}</p>}

            {!shareable && !editing ? (
              <div className="stack">
                <p className="empty">{t('profile.comingSoon')}</p>
                <div className="next-actions">
                  <Button small onClick={busy ? undefined : extract} disabled={busy}>
                    {busy ? t('login.loading') : '跟阿澈聊过之后，手动生成档案'}
                  </Button>
                </div>
              </div>
            ) : editing && draft ? (
              <div className="stack">
                <label className="field">
                  <span>一句话介绍（40 字内）</span>
                  <textarea
                    className="input"
                    rows={2}
                    maxLength={40}
                    value={draft.intro}
                    onChange={(e) => setDraft({ ...draft, intro: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>兴趣（用「、」分隔，最多 12 项）</span>
                  <input
                    className="input"
                    value={draft.interests.join('、')}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        interests: e.target.value.split(/[、,，]/).map((x) => x.trim()).filter(Boolean),
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>聊天风格（60 字内）</span>
                  <input
                    className="input"
                    maxLength={60}
                    value={draft.chat_style}
                    onChange={(e) => setDraft({ ...draft, chat_style: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>想找什么样的人（60 字内）</span>
                  <input
                    className="input"
                    maxLength={60}
                    value={draft.looking_for}
                    onChange={(e) => setDraft({ ...draft, looking_for: e.target.value })}
                  />
                </label>
                <div className="next-actions">
                  <Button onClick={busy ? undefined : save} disabled={busy}>
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
                  <Button small variant="secondary" onClick={busy ? undefined : extract} disabled={busy}>
                    {busy ? t('login.loading') : '重新撷取'}
                  </Button>
                  {!view?.confirmed && (
                    <Button small onClick={busy ? undefined : extract} disabled={busy}>
                      {t('profile.saveConfirm')}
                    </Button>
                  )}
                </div>
                {!view?.confirmed && <p className="hint-inline">{t('profile.confirmShareNote')}</p>}
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
        </div>

        {/* 它记得的事（mock demo 数据；http 接入留给 A3 后续批次） */}
        {memoriesSection}
      </div>
    </div>
  )
}

function MemoriesSection() {
  const s = useDemoStore()
  return (
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
  )
}

// ───────────────────────── mock 模式 ─────────────────────────

function MockProfileSection() {
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
    s.confirmProfile()
    setEditing(false)
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('profile.title')}</h1>
        <p>{t('profile.shareableNote')}</p>
      </div>

      {/* 桌机双栏：档案+说话风格（左）／它记得的事（右） */}
      <div className="profile-layout">
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
        </div>

        {/* 它记得的事 */}
        <MemoriesSection />
      </div>
    </div>
  )
}
