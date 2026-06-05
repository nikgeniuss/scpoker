import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/__tests__/helpers/**', 'node_modules', 'dist'],
    globals: false,
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 5_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/game/**/*.ts'],
      exclude: ['src/game/**/*.test.ts', 'src/game/__tests__/**'],
      thresholds: {
        'src/game/hands.ts': { lines: 95, branches: 90, functions: 95, statements: 95 },
        'src/game/deck.ts': { lines: 95, branches: 85, functions: 100, statements: 95 },
        // Functions 60% (а не 70%) — admin/bot методы (adminKickPlayer, seatBot, buildBotContext
        // и т.п.) явно out-of-scope в плане теста (§H). Цель — покрыть правила игры,
        // не админ-обвязку.
        'src/game/GameManager.ts': { lines: 70, branches: 60, functions: 60, statements: 70 },
      },
    },
  },
});
