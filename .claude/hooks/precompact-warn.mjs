#!/usr/bin/env node
// PreCompact hook: срабатывает перед сжатием контекста.
// При auto-триггере (контекст переполнился) — выводит пользователю напоминание
// сделать /clear для чистой сессии. При manual (/compact руками) — молчит.
//
// Никогда не блокирует сжатие: при любой ошибке или непонятном входе — пустой output + exit 0.
import { readFileSync } from 'node:fs';

let raw = '';
try {
  raw = readFileSync(0, 'utf8');
} catch {
  console.log('{}');
  process.exit(0);
}

let event = {};
try {
  event = JSON.parse(raw || '{}');
} catch {
  console.log('{}');
  process.exit(0);
}

const trigger = event?.trigger ?? 'unknown';

if (trigger === 'auto') {
  const msg =
    '⚠️ Контекст почти заполнен — сейчас сработает авто-сжатие (тратит токены, может потерять ранние правила).\n' +
    '   Лучше: заверши текущий кусок и сделай /clear — свежая сессия чище и дешевле.';
  console.log(JSON.stringify({ systemMessage: msg }));
} else {
  console.log('{}');
}

process.exit(0);
