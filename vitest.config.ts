import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // 测试一律走 mock，避免本机 .env.local 的 VITE_API_MODE=http 把 B/C 的 mock 测打挂
    env: { VITE_API_MODE: 'mock' },
  },
})
