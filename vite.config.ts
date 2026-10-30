import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

const r = (p: string) => path.resolve(__dirname, p)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': r('./src'),
      '@theme': r('./src/theme'),
      '@components': r('./src/components'),
      '@i18n': r('./src/i18n'),
      '@store': r('./src/store'),
      '@demo': r('./src/demo'),
      '@lib': r('./src/lib'),
      '@hooks': r('./src/hooks'),
      '@features': r('./src/features'),
    },
  },
})
