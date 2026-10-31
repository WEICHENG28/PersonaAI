// 通知音效：用 Web Audio 產生一聲短短的「叮咚」，不用音檔、不用新套件。
// 瀏覽器規定要使用者先點過頁面才能出聲，所以第一次點擊時解鎖；還沒解鎖就安靜略過。
let ctx: AudioContext | null = null
let unlocked = false

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  ctx ??= new Ctor()
  return ctx
}

if (typeof window !== 'undefined') {
  const unlock = () => {
    unlocked = true
    void audio()?.resume().catch(() => {})
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
}

/** 叮咚兩個音（E6 → A5），總長約 0.45 秒、音量小。 */
export function playNotifySound(): void {
  if (!unlocked) return
  const ac = audio()
  if (!ac) return
  try {
    const now = ac.currentTime
    ;[
      { freq: 1318.5, at: 0 },
      { freq: 880, at: 0.16 },
    ].forEach(({ freq, at }) => {
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + at)
      gain.gain.exponentialRampToValueAtTime(0.18, now + at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.28)
      osc.connect(gain).connect(ac.destination)
      osc.start(now + at)
      osc.stop(now + at + 0.3)
    })
  } catch {
    /* 出不了聲就算了，不影響通知 */
  }
}

/** 數字變大才響（第一次載入不響，避免一打開頁面就叮咚）。 */
export function shouldChime(prev: number | null, next: number): boolean {
  return prev !== null && next > prev
}
