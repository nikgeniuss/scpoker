import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// Отдельный конфиг для тестов — не трогает dev-server (vite.config.ts).
// jsdom-окружение для компонентных тестов; чистая логика тоже гоняется тут.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@poker-room/shared': path.resolve(__dirname, '../shared/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})
