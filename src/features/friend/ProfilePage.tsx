import { useEffect, useState } from 'react'
import { Button, Chip } from '@components/ui/Button'
import { Card, CardHead } from '@components/ui/Card'
import { useDemoStore } from '@store/useDemoStore'
import { t } from '@i18n/t'
import {
  fetchProfile,
  saveShareable,
  requestExtractProfile,
  editMemory,
  fetchFunLabels,
  generateFunLabels,
  setUserMbti,
  type ShareableView,
  type ShareableInput,
  type FunLabels,
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

  /** 確認目前的草稿可以對外使用（PUT /api/profile/shareable，設 shareable_confirmed = true）。 */
  const confirmCurrent = async () => {
    if (!view?.shareable) return
    setBusy(true)
    setError(null)
    try {
      setView(await saveShareable(view.shareable))
    } catch (e) {
      setError(e instanceof Error ? e.message : '确认失败，再试一次？')
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
      <div className="profile-layout">
        <div className="stack">
          {/* 对外档案 */}
          <Card>
            <CardHead
              title={t('profile.shareable')}
              right={
                view?.confirmed ? (
                  <Chip tone="mint">已确认</Chip>
                ) : shareable ? (
                  <Chip tone="well">未确认（确认后才对外）</Chip>
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
                  <InterestsInput value={draft.interests} onChange={(interests) => setDraft({ ...draft, interests })} />
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
                    // 之前誤接到 extract（重新撷取），按了只會重產草稿、永遠確認不了
                    <Button small onClick={busy ? undefined : confirmCurrent} disabled={busy}>
                      {t('profile.saveConfirm')}
                    </Button>
                  )}
                </div>
                {!view?.confirmed && <p className="hint-inline">{t('profile.confirmShareNote')}</p>}
              </div>
            )}
          </Card>
        </div>

        {/* 它记得的事（mock demo 数据；http 接入留给 A3 后续批次） */}
        {memoriesSection}
      </div>    </div>
  )
}

/** A3+A8：记忆列表（mock 用 store；http 模式支持 PATCH 编辑）。 */
function MemoriesSection() {
  const s = useDemoStore()
  const httpMode = isHttpModeCached()

  // http 模式下的编辑状态：{ [id]: draftContent }
  const [editDrafts, setEditDrafts] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editSaving, setEditSaving] = useState(false)

  // mock 模式数据（兼容 http 模式也显示 store 里的演示数据）
  const memories = s.memories

  const startEdit = (id: string, content: string) => {
    setEditDrafts((d) => ({ ...d, [id]: content }))
    setEditingId(id)
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async (id: string) => {
    const content = editDrafts[id] ?? ''
    if (!content.trim()) return
    if (httpMode) {
      setEditSaving(true)
      try {
        await editMemory(id, content)
        // 更新本地 store（mock store 无 editMemory，直接更新展示用数据）
        s.memories.find((m) => m.id === id) && Object.assign(s.memories.find((m) => m.id === id)!, { content })
      } catch (e) {
        console.error('[ProfilePage] editMemory', e)
      } finally {
        setEditSaving(false)
      }
    }
    setEditingId(null)
  }

  return (
    <Card>
      <CardHead title={t('profile.memories')} />
      {memories.length === 0 ? (
        <p className="empty">{t('profile.memoriesEmpty')}</p>
      ) : (
        <ul className="mem-list">
          {memories.map((m) => (
            <li key={m.id} className="mem">
              {editingId === m.id ? (
                <div className="stack" style={{ gap: '0.5rem' }}>
                  <textarea
                    className="input"
                    rows={2}
                    maxLength={200}
                    value={editDrafts[m.id] ?? m.content}
                    onChange={(e) => setEditDrafts((d) => ({ ...d, [m.id]: e.target.value }))}
                    style={{ resize: 'vertical', width: '100%' }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button small variant="primary" onClick={() => void saveEdit(m.id)} disabled={editSaving}>
                      {editSaving ? '保存中…' : '保存'}
                    </Button>
                    <Button small variant="secondary" onClick={cancelEdit}>取消</Button>
                  </div>
                </div>
              ) : (
                <p>{m.content}</p>
              )}
              <footer>
                <Chip tone="well">{m.source}</Chip>
                {httpMode && editingId !== m.id && (
                  <button className="mem-del" onClick={() => startEdit(m.id, m.content)}>
                    编辑
                  </button>
                )}
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
      {/* 桌机双栏：档案+说话风格（左）／它记得的事（右） */}
      <div className="profile-layout">
        <div className="stack">
          {/* 对外档案 */}
          <Card>
          <CardHead
            title={t('profile.shareable')}
            right={
              s.profile.confirmed ? (
                <Chip tone="mint">已确认</Chip>
              ) : (
                <Chip tone="well">未确认（确认后才对外）</Chip>
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
                <InterestsInput value={draft.interests} onChange={(interests) => setDraft({ ...draft, interests })} />
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
        </div>

        {/* 它记得的事 */}
        <MemoriesSection />

        {/* A9：娱乐标签（P2） */}
        <FunLabelsSection />
      </div>
    </div>
  )
}

// ───────────────────────── A9：娱乐标签 ─────────────────────────

/** 显示 AI 猜测的 MBTI 与用户自填 MBTI 的对照（仅供娱乐）。
 *  http 模式：GET /api/profile/fun 加载；POST 生成；PUT 自填。
 *  mock 模式：不显示（P2 占位符）。
 */
function FunLabelsSection() {
  const httpMode = isHttpModeCached()
  const [funLabels, setFunLabels] = useState<FunLabels | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userMbtiDraft, setUserMbtiDraft] = useState('')
  const [savingMbti, setSavingMbti] = useState(false)

  useEffect(() => {
    if (!httpMode) return
    fetchFunLabels().then((d) => {
      if (d) {
        setFunLabels(d)
        setUserMbtiDraft(d.user_mbti ?? '')
      }
    }).catch(console.error)
  }, [httpMode])

  if (!httpMode) return null  // mock 模式不显示（P2）

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await generateFunLabels()
      setFunLabels(data)
      setUserMbtiDraft(data.user_mbti ?? '')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '生成失败，请再试一次')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveMbti = async () => {
    const val = userMbtiDraft.trim().toUpperCase()
    const isValid = /^[EI][NS][TF][JP]$/.test(val)
    const mbti = val && isValid ? val : null
    setSavingMbti(true)
    try {
      const data = await setUserMbti(mbti)
      setFunLabels(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSavingMbti(false)
    }
  }

  return (
    <Card>
      <CardHead
        title="性格小报告"
        sub="仅供娱乐，不用于任何判定"
        right={<Chip tone="pear">仅供娱乐</Chip>}
      />

      {!funLabels ? (
        <div className="stack" style={{ gap: '0.75rem' }}>
          <p className="hint-inline">AI 会根据你的对外档案猜测你的 MBTI，写一段轻松的性格小报告。</p>
          {error && <p style={{ color: 'var(--c-err)' }}>{error}</p>}
          <Button small variant="secondary" onClick={() => void handleGenerate()} disabled={loading}>
            {loading ? '生成中…' : '生成性格小报告'}
          </Button>
        </div>
      ) : (
        <div className="stack" style={{ gap: '1rem' }}>
          {/* AI 猜测 */}
          <div>
            <p style={{ fontWeight: 600 }}>AI 猜你是：<Chip tone="pear">{funLabels.mbti_guess}</Chip></p>
            <p className="hint-inline">{funLabels.reason}</p>
            <p style={{ marginTop: '0.5rem' }}>{funLabels.report}</p>
          </div>

          {/* 你以为的你 vs AI 猜的你 */}
          <div>
            <p style={{ fontWeight: 600 }}>你以为自己是：</p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                className="input"
                placeholder="输入 MBTI（如 INFP）"
                value={userMbtiDraft}
                onChange={(e) => setUserMbtiDraft(e.target.value.toUpperCase())}
                maxLength={4}
                style={{ maxWidth: 120 }}
              />
              <Button small variant="secondary" onClick={() => void handleSaveMbti()} disabled={savingMbti}>
                {savingMbti ? '保存中…' : '确认'}
              </Button>
              {funLabels.user_mbti && funLabels.user_mbti !== funLabels.mbti_guess && (
                <span className="hint-inline">你说 {funLabels.user_mbti}，AI 猜 {funLabels.mbti_guess}，有点不同 😄</span>
              )}
              {funLabels.user_mbti && funLabels.user_mbti === funLabels.mbti_guess && (
                <span className="hint-inline">你说 {funLabels.user_mbti}，AI 也猜 {funLabels.mbti_guess}，想法一致！</span>
              )}
            </div>
          </div>

          {error && <p style={{ color: 'var(--c-err)' }}>{error}</p>}
          <Button small variant="secondary" onClick={() => void handleGenerate()} disabled={loading}>
            {loading ? '重新生成中…' : '重新生成'}
          </Button>
        </div>
      )}
    </Card>
  )
}

/**
 * 兴趣输入框：框里保留用户实际打的字（包含结尾的「、」），只在背后拆成兴趣列表。
 * 之前直接用 interests.join('、') 当 value，打下「、」的瞬间会被当成空项删掉，所以打不出分隔符。
 * 可以用「、」、逗号或空格分隔。
 */
function InterestsInput({ value, onChange }: { value: string[]; onChange: (interests: string[]) => void }) {
  const [text, setText] = useState(() => value.join('、'))
  return (
    <input
      className="input"
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        onChange(splitInterests(e.target.value))
      }}
    />
  )
}

export function splitInterests(text: string): string[] {
  return text
    .split(/[、,，s]+/)
    .map((x) => x.trim())
    .filter(Boolean)
}
