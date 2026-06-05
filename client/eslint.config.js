import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // `_`-префикс = намеренно неиспользуемая переменная (напр. drop в деструктуризации).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Правило react-hooks v7: срабатывает и на корректных эффектах (clamp при смене пропа,
      // reset драфта при открытии модалки, fetch-reset). Понижено до warn — точечная
      // переработка эффектов идёт в декомпозиции GameRoom/Lobby (ROADMAP §9.3-E).
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
