import type { Config } from 'tailwindcss'

/**
 * Hum theme (Hallmark) — every color/font/radius maps to the CSS variables
 * defined in app/globals.css. Never hardcode values here (vibecodex C10).
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './i18n/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        text: 'var(--color-text)',
        muted: 'var(--color-muted)',
        friend: 'var(--color-friend)',
        twin: 'var(--color-twin)',
        human: 'var(--color-human)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
      },
      fontFamily: {
        body: ['var(--font-body)'],
      },
      borderRadius: {
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        sticker: 'var(--shadow-sticker)',
      },
    },
  },
  plugins: [],
}

export default config
