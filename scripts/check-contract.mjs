// Guard синхронности сетевого контракта (CLAUDE.md §0.11, ROADMAP §9.3-A).
// Ловит ровно тот класс дрейфа, что уже находил аудит:
//   1) серверная копия SOCKET_EVENTS разошлась с shared/index.ts;
//   2) socket-событие заведено строкой в обход общего словаря SOCKET_EVENTS.
// READ-ONLY: только парсит исходники и возвращает exit-код (0 — ок, 1 — рассинхрон).
// Запуск: node scripts/check-contract.mjs (или npm run check:contract).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

// Парсит литерал `SOCKET_EVENTS = { KEY: 'value', ... } as const` → Map<key, value>.
function parseSocketEvents(src, label) {
  const block = src.match(/SOCKET_EVENTS\s*=\s*\{([\s\S]*?)\}\s*as const/);
  if (!block) throw new Error('Не нашёл объект SOCKET_EVENTS в ' + label);
  const map = new Map();
  const re = /(\w+)\s*:\s*'([^']+)'/g;
  let p;
  while ((p = re.exec(block[1]))) map.set(p[1], p[2]);
  return map;
}

// Парсит имена полей интерфейса `interface X { field: ...; field2?: ...; }` → Set<field>.
// Только верхнеуровневые поля (по началу строки) — вложенные inline-объекты не считаются.
function parseInterfaceFields(src, name) {
  const re = new RegExp('(?:export\\s+)?interface\\s+' + name + '\\s*\\{([\\s\\S]*?)\\n\\}');
  const m = src.match(re);
  if (!m) return null;
  const fields = new Set();
  const fr = /^\s*(\w+)\??\s*:/gm;
  let p;
  while ((p = fr.exec(m[1]))) fields.add(p[1]);
  return fields;
}

// Рекурсивно собирает файлы с нужными расширениями (без node_modules/dist/тестов).
function walk(dir, exts, acc) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, exts, acc);
    else if (exts.some((e) => name.endsWith(e))) acc.push(full);
  }
  return acc;
}

const errors = [];
const warnings = [];

// --- Проверка 1: shared ↔ server-локальная копия SOCKET_EVENTS ---
const sharedEvents = parseSocketEvents(read('shared/index.ts'), 'shared/index.ts');
const serverEvents = parseSocketEvents(read('server/src/game/GameManager.ts'), 'server/src/game/GameManager.ts');

for (const [k, v] of sharedEvents) {
  if (!serverEvents.has(k)) errors.push('SOCKET_EVENTS.' + k + " есть в shared, но НЕТ в server-копии (GameManager.ts)");
  else if (serverEvents.get(k) !== v) errors.push('SOCKET_EVENTS.' + k + ": shared='" + v + "' ≠ server='" + serverEvents.get(k) + "'");
}
for (const k of serverEvents.keys()) {
  if (!sharedEvents.has(k)) errors.push('SOCKET_EVENTS.' + k + ' есть в server-копии, но НЕТ в shared/index.ts');
}

// --- Проверка 2: ни одного socket-события в обход словаря ---
const known = new Set(sharedEvents.values());
// Системные события socket.io / Node-процесса — не часть игрового протокола.
const SYSTEM = new Set(['connection', 'connect', 'disconnect', 'disconnecting', 'connect_error']);
const PROCESS = new Set(['beforeExit', 'SIGINT', 'SIGTERM', 'exit', 'uncaughtException', 'unhandledRejection']);
// Baseline существующего долга (ROADMAP §9.3-A): реально используемые события вне словаря.
// requestGameState/forceDisconnect внесены в SOCKET_EVENTS 2026-06-04 — baseline пуст.
// НЕ добавлять сюда новые: новое событие должно идти в SOCKET_EVENTS, а не в этот список.
const KNOWN_UNLISTED = new Set([]);

const files = [];
walk(join(ROOT, 'client', 'src'), ['.ts', '.tsx'], files);
walk(join(ROOT, 'server', 'src'), ['.ts'], files);

const offenders = new Map(); // event → Set<file>
for (const f of files) {
  if (f.includes('__tests__')) continue;
  const src = readFileSync(f, 'utf8');
  const re = /\.(?:emit|on|off)\(\s*'([^']+)'/g;
  let p;
  while ((p = re.exec(src))) {
    const ev = p[1];
    if (known.has(ev) || SYSTEM.has(ev) || PROCESS.has(ev)) continue;
    const where = relative(ROOT, f);
    if (KNOWN_UNLISTED.has(ev)) {
      warnings.push("'" + ev + "' используется вне SOCKET_EVENTS (известный долг): " + where);
      continue;
    }
    if (!offenders.has(ev)) offenders.set(ev, new Set());
    offenders.get(ev).add(where);
  }
}
for (const [ev, where] of offenders) {
  errors.push("Новое socket-событие '" + ev + "' НЕ в SOCKET_EVENTS (shared/index.ts): " + [...where].join(', ') + '. Добавь в словарь и используй SOCKET_EVENTS.* (CLAUDE.md §6, §0.11).');
}

// --- Проверка 3: синхронность ПОЛЕЙ ключевых типов shared ↔ server-копия (ROADMAP §9.3-A) ---
// Ловит дрейф наборов полей (добавили поле в shared, забыли в server-копии GameManager.ts, и наоборот).
// Типы сравниваются ПО ИМЕНАМ полей (не по типам — server.GameState.players: PublicPlayer[] это ок).
const sharedSrc = read('shared/index.ts');
const serverTypesSrc = read('server/src/game/GameManager.ts');

// Известные намеренные расхождения (поле в одном, но не в другом — by design).
// RoomInfo больше не дублируется отдельным interface (re-export из shared, см. isReExportedFromShared) —
// прежнее расхождение isBotTable снято вместе с самим полем (было мёртвым, 2026-06-18).
const KNOWN_FIELD_DIFFS = {};

// Тип re-export'ится из @poker-room/shared (а не дублируется отдельным `interface`) —
// значит он буквально ОДНО определение, сверка полей не нужна (не может разойтись).
function isReExportedFromShared(src, name) {
  const re = new RegExp("(?:import|export)\\s+type\\s*\\{[^}]*\\b" + name + "\\b[^}]*\\}\\s*(?:,[^;]*)?from\\s*'@poker-room/shared'");
  return re.test(src);
}

const TYPES_TO_SYNC = ['GameState', 'RoomInfo', 'CreateRoomOptions'];
for (const t of TYPES_TO_SYNC) {
  if (isReExportedFromShared(serverTypesSrc, t)) continue; // одно определение — синхронность гарантирована структурно
  const a = parseInterfaceFields(sharedSrc, t);
  const b = parseInterfaceFields(serverTypesSrc, t);
  if (!a) { errors.push('Тип ' + t + ' не найден в shared/index.ts'); continue; }
  if (!b) { errors.push('Тип ' + t + ' не найден в server-копии (GameManager.ts)'); continue; }
  const allow = KNOWN_FIELD_DIFFS[t] ?? new Set();
  for (const f of a) {
    if (b.has(f)) continue;
    if (allow.has(f)) warnings.push(t + '.' + f + ' — в shared есть, в server-копии нет (известное расхождение)');
    else errors.push(t + '.' + f + ' есть в shared/index.ts, но НЕТ в server-копии (GameManager.ts) — синхронизируй поле');
  }
  for (const f of b) {
    if (a.has(f)) continue;
    if (allow.has(f)) warnings.push(t + '.' + f + ' — в server есть, в shared нет (известное расхождение)');
    else errors.push(t + '.' + f + ' есть в server-копии (GameManager.ts), но НЕТ в shared/index.ts — синхронизируй поле');
  }
}

// --- Проверка 4: shared.Player → server.Player (ОДНОСТОРОННЕ, ROADMAP §9.3-A) ---
// server.Player — намеренно более богатая внутренняя модель (socketId/таймеры/totalCommitted и
// т.п., см. аудит 2026-06-18) — лишние server-only поля это НЕ дрейф, поэтому проверка не
// двусторонняя как для RoomInfo/CreateRoomOptions выше. Но каждое поле shared.Player обязано
// либо реально храниться в server.Player, либо (если оно считается только в сериализаторе —
// как handHint/shownCards в gameStateSerializer.ts) попасть в список ниже.
const COMPUTED_ONLY_PUBLIC_FIELDS = new Set(['handHint', 'handRank', 'shownCards', 'willWin']);
const sharedPlayerFields = parseInterfaceFields(sharedSrc, 'Player');
const serverPlayerFields = parseInterfaceFields(serverTypesSrc, 'Player');
if (!sharedPlayerFields) errors.push('Тип Player не найден в shared/index.ts');
else if (!serverPlayerFields) errors.push('Тип Player не найден в server-копии (GameManager.ts)');
else {
  for (const f of sharedPlayerFields) {
    if (serverPlayerFields.has(f) || COMPUTED_ONLY_PUBLIC_FIELDS.has(f)) continue;
    errors.push(
      'Player.' + f + ' есть в shared/index.ts, но НЕТ ни в server.Player (GameManager.ts), ни в ' +
      'COMPUTED_ONLY_PUBLIC_FIELDS (check-contract.mjs) — синхронизируй поле или добавь его в список, ' +
      'если оно считается только при сериализации.'
    );
  }
}

// --- Отчёт ---
const uniqWarnings = [...new Set(warnings)];
if (uniqWarnings.length) {
  console.log('\n⚠️  Контракт — известный долг (не блокирует, см. ROADMAP §9.3-A):');
  for (const w of uniqWarnings) console.log('   - ' + w);
}
if (errors.length) {
  console.error('\n❌ Контракт рассинхронизирован:');
  for (const e of errors) console.error('   - ' + e);
  console.error('\n' + errors.length + ' ошибк(а/и). Источник правил: CLAUDE.md §0.11, ROADMAP §9.3-A.');
  process.exit(1);
}
console.log(
  '\n✅ Контракт синхронен: ' + sharedEvents.size + ' событий в SOCKET_EVENTS, проверено ' + files.length +
  ' файлов, 0 событий в обход словаря' + (uniqWarnings.length ? ' (+' + uniqWarnings.length + ' известных долга)' : '') + '.'
);
