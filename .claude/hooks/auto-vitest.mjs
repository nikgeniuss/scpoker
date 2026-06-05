#!/usr/bin/env node
// PostToolUse hook: запускает vitest после Edit/Write в server/src/game или server/src/auth.
// При любой ошибке хука (stdin не читается, JSON не парсится, npm test не найден)
// — exit 0 (молча пропускаем). Только при настоящем фейле теста — exit 2.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let raw = '';
try {
  raw = readFileSync(0, 'utf8');
} catch {
  process.exit(0);
}

let event;
try {
  event = JSON.parse(raw);
} catch {
  process.exit(0);
}

const filePath = event?.tool_input?.file_path || '';

// Только server/src/game/ и server/src/auth/ .ts файлы
if (!/server[\\/]src[\\/](game|auth)[\\/].+\.ts$/.test(filePath)) {
  process.exit(0);
}

console.log(`\n🧪 [auto-vitest] Правка в ${filePath} — запускаю server тесты...`);

try {
  execSync('npm test --silent -- --run --bail=1', {
    cwd: 'server',
    stdio: 'inherit',
    timeout: 90_000,
  });
  console.log('✅ [auto-vitest] OK');
  process.exit(0);
} catch (e) {
  console.error(`\n❌ [auto-vitest] Тесты упали после правки ${filePath}.`);
  console.error('   Перед продолжением — починить или явно сообщить пользователю что сломалось.');
  process.exit(2); // exit 2 = блок-уровень: Claude увидит и должен отреагировать
}
