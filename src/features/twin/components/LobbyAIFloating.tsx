/**
 * 大厅 AI 助手——右下角浮动按钮 + 弹出对话面板。
 * 拥有者：A（布局与 UI）；AI 助手逻辑由 C 的 askLobbyAssistant 提供。
 *
 * 交互：
 * - 右下角圆钮（fish Rive）→ 点击展开/收起弹窗
 * - 弹窗顶部有 3 个预设提示（帮我找 / 什么类型 / 怎么开始）
 * - 自由输入框 + 发送
 * - 关闭钮（弹窗右上角 ×）
 */
import { useState, useRef, useEffect } from 'react'
import { RiveAvatar } from '@components/ui/RiveAvatar'
import { Button } from '@components/ui/Button'
import { api } from '@lib/api'
import { isLiveChat } from '@lib/api/twin'
import { t } from '@i18n/t'

const PRESETS = [
  '帮我找 3 个喜欢登山的人聊聊',
  '适合找什么类型的朋友？',
  '怎么开始让 Agent 帮我找人？',
]

interface Message { role: 'user' | 'assistant'; text: string }

export function LobbyAIFloating() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  const send = async (text: string) => {
    const q = text.trim()
    if (!q || busy) return
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', text: q }])
    setBusy(true)
    try {
      let reply: string
      if (isLiveChat) {
        // http 模式：调用真实 C 线助手
        const { askLobbyAssistant } = await import('@lib/api/twin')
        const res = await askLobbyAssistant(q)
        reply = res.kind === 'answer' ? res.answer : '好的，正在帮你安排任务…'
      } else {
        // mock 模式
        reply = await api.askLobbyHelper(q)
      }
      setMessages((prev) => [...prev, { role: 'assistant', text: reply }])
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', text: '暂时没法回答，稍后再试？' }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* ── 弹窗面板 ── */}
      {open && (
        <div className="lobby-ai-popup" role="dialog" aria-label="大厅 AI 助手">
          <div className="lobby-ai-popup__head">
            <RiveAvatar name="fish" size={32} />
            <span>{t('lobby.twinHelper')}</span>
            <button
              className="lobby-ai-popup__close"
              onClick={() => setOpen(false)}
              aria-label="关闭"
            >
              ×
            </button>
          </div>

          {/* 预设提示（只在没有消息时显示） */}
          {messages.length === 0 && (
            <div className="lobby-ai-popup__presets">
              {PRESETS.map((p) => (
                <button key={p} className="lobby-ai-preset" onClick={() => void send(p)}>
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* 对话气泡 */}
          {messages.length > 0 && (
            <div className="lobby-ai-popup__chat">
              {messages.map((m, i) => (
                <div key={i} className={`lobby-ai-bubble lobby-ai-bubble--${m.role}`}>
                  {m.text}
                </div>
              ))}
              {busy && (
                <div className="lobby-ai-bubble lobby-ai-bubble--assistant lobby-ai-bubble--thinking">
                  <span className="dot-pulse" />
                  <span className="dot-pulse" />
                  <span className="dot-pulse" />
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}

          {/* 输入框 */}
          <div className="lobby-ai-popup__input">
            <input
              className="input"
              placeholder={t('lobby.helperPlaceholder')}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && void send(input)}
              disabled={busy}
              maxLength={200}
            />
            <Button small onClick={() => void send(input)} disabled={busy || !input.trim()}>
              {t('lobby.helperSend')}
            </Button>
          </div>
        </div>
      )}

      {/* ── 浮动触发钮 ── */}
      <button
        className={`lobby-ai-fab ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? '收起 AI 助手' : '打开 AI 助手'}
        title="大厅 AI 助手"
      >
        <RiveAvatar name="fish" size={48} />
      </button>
    </>
  )
}
