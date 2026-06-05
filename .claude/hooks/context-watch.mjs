#!/usr/bin/env node
// Stop hook: после каждого ответа Claude считает реальное заполнение контекста
// по транскрипту сессии и предупреждает пользователя на заданных порогах.
//
// Эскалация: предупреждает один раз при пересечении каждого порога за сессию
// (без спама на каждый ход). Состояние — в .context-watch-state.json (ключ = session_id).
//
// Никогда не блокирует: при любой ошибке — пустой output + exit 0.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- НАСТРОЙКИ (меняй здесь) ---
const LIMIT = 1_000_000;            // размер контекстного окна модели (opus-4-8[1m] = 1M)
const THRESHOLDS = [60, 75, 88];    // проценты, на которых предупреждать
// -------------------------------

function out(obj) {
  console.log(JSON.stringify(obj ?? {}));
  process.exit(0);
}

let event = {};
try {
  event = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  out({});
}

const transcriptPath = event?.transcript_path;
const sessionId = event?.session_id ?? 'unknown';
if (!transcriptPath || !existsSync(transcriptPath)) out({});

// Найти последнюю строку с usage, посчитать контекст
let contextTokens = 0;
try {
  const lines = readFileSync(transcriptPath, 'utf8').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('cache_read_input_tokens')) continue;
    const m = JSON.parse(lines[i]);
    const u = m?.message?.usage ?? m?.usage;
    if (u && typeof u.cache_read_input_tokens === 'number') {
      contextTokens =
        (u.input_tokens || 0) +
        (u.cache_creation_input_tokens || 0) +
        (u.cache_read_input_tokens || 0);
      break;
    }
  }
} catch {
  out({});
}

if (contextTokens <= 0) out({});

const percent = Math.round((contextTokens / LIMIT) * 100);

// Состояние: highest порог, о котором уже предупредили в этой сессии
const stateFile = join(dirname(fileURLToPath(import.meta.url)), '.context-watch-state.json');
let state = {};
try {
  if (existsSync(stateFile)) state = JSON.parse(readFileSync(stateFile, 'utf8'));
} catch {
  state = {};
}
const alreadyWarned = state[sessionId] || 0;

// Самый высокий пройденный порог
let crossed = 0;
for (const t of THRESHOLDS) {
  if (percent >= t) crossed = t;
}

if (crossed > alreadyWarned) {
  state[sessionId] = crossed;
  try {
    writeFileSync(stateFile, JSON.stringify(state));
  } catch {
    /* пофиг если не записалось — в худшем случае предупредит ещё раз */
  }
  const k = Math.round(contextTokens / 1000);
  const msg =
    `📊 Контекст: ~${percent}% (${k}K / ${Math.round(LIMIT / 1000)}K токенов).\n` +
    (crossed >= 88
      ? '   🔴 Скоро авто-сжатие. Заверши мысль и сделай /clear сейчас.'
      : crossed >= 75
        ? '   🟠 Заполняется. Хороший момент закруглить кусок и сделать /clear.'
        : '   🟡 Перевалило за половину. Держи в уме /clear на ближайшей паузе.');
  out({ systemMessage: msg });
}

out({});
