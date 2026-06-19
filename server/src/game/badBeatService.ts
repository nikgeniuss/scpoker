// Bad Beat Jackpot — состояние и конфиг (Фаза 1: пул + настройки, без детекта/выплат).
// Источник правды — server/data/badbeat.json (атомарно через writeJSON, §0.4). Файл в data/,
// nodemon его не watch'ит (§0.3) — записи не рестартят сервер.
// Значения-дефолты зеркалят client/src/config/badBeat.ts (типы дублируются как и прочий shared, см. ARCHITECTURE).
import { readJSON, writeJSON } from '../auth/storage.js';

const FILE = 'badbeat.json';

export interface BadBeatTier {
  blinds: string;
  bb: number; // дроп в ББ
  win: number; // % бэд-бит победитель
  opp: number; // % бэд-бит противник
  oth: number; // % остальные (1/n)
}
export interface BadBeatTopUp {
  ts: number; // epoch ms
  amount: number; // центы
  by: string; // ник админа
}
export interface BadBeatHit {
  ts: number; // epoch ms
  total: number; // всего выплачено из пула (центы)
  loser: string; // userId «бэд-бит победителя» (проиграл монстр-рукой)
  opponent: string; // userId противника (забрал банк)
}
export interface BadBeatState {
  enabled: boolean;
  pool: number; // центы
  dropMode: 'bb' | 'percent';
  percent: number; // % с пост-рейкового банка (когда dropMode='percent')
  triggers: Record<string, string>; // formatKey → presetId (мин. проигравшая рука)
  tiers: BadBeatTier[]; // таблица блайнды/дроп/проценты выплат
  topups: BadBeatTopUp[];
  hits: BadBeatHit[]; // лог срабатываний джекпота
}

const DEFAULT_TIERS: BadBeatTier[] = [
  { blinds: '0.01/0.02 ~ 0.05/0.10', bb: 0.6, win: 8.25, opp: 3.75, oth: 3.0 },
  { blinds: '0.10/0.20 ~ 0.30/0.60', bb: 0.4, win: 13.75, opp: 6.25, oth: 5.0 },
  { blinds: '0.50/1 ~ 2.50/5', bb: 0.25, win: 19.25, opp: 8.75, oth: 7.0 },
  { blinds: '3/6 ~ 5/10', bb: 0.12, win: 27.5, opp: 12.5, oth: 10.0 },
  { blinds: '7/14 ~ 15/30', bb: 0.06, win: 35.75, opp: 16.25, oth: 13.0 },
  { blinds: '25/50 ~ Higher', bb: 0.03, win: 44.0, opp: 20.0, oth: 16.0 },
];

function defaults(): BadBeatState {
  return {
    enabled: false,
    pool: 0,
    dropMode: 'bb',
    percent: 0.15,
    triggers: { nlh: 'aaajj', short: 'aaaa' },
    tiers: DEFAULT_TIERS.map((t) => ({ ...t })),
    topups: [],
    hits: [],
  };
}

// Загрузка с дефолтами (файла может ещё не быть → defaults).
function load(): BadBeatState {
  try {
    const s = readJSON(FILE) as Partial<BadBeatState>;
    const d = defaults();
    return {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : d.enabled,
      pool: typeof s.pool === 'number' && s.pool >= 0 ? s.pool : d.pool,
      dropMode: s.dropMode === 'percent' ? 'percent' : 'bb',
      percent: typeof s.percent === 'number' && s.percent >= 0 ? s.percent : d.percent,
      triggers: { ...d.triggers, ...(s.triggers ?? {}) },
      tiers: Array.isArray(s.tiers) && s.tiers.length ? s.tiers.map(sanitizeTier) : d.tiers,
      topups: Array.isArray(s.topups) ? s.topups.slice(0, 200) : d.topups,
      hits: Array.isArray(s.hits) ? s.hits.slice(0, 200) : d.hits,
    };
  } catch {
    return defaults();
  }
}

function save(s: BadBeatState): void {
  writeJSON(FILE, s);
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);
function sanitizeTier(t: Partial<BadBeatTier>): BadBeatTier {
  return {
    blinds: typeof t.blinds === 'string' ? t.blinds : '',
    bb: num(t.bb, 0),
    win: num(t.win, 0),
    opp: num(t.opp, 0),
    oth: num(t.oth, 0),
  };
}

// Полное состояние (для админки).
export function getBadBeatState(): BadBeatState {
  return load();
}

// Публичная вьюшка для игроков: пул + флаг + таблица выплат (без истории пополнений).
export function getBadBeatPublic(): { enabled: boolean; pool: number; tiers: BadBeatTier[] } {
  const s = load();
  return { enabled: s.enabled, pool: s.pool, tiers: s.tiers };
}

// Обновление конфига админом (частичный патч валидируемых полей).
export function updateBadBeat(patch: Partial<BadBeatState>): BadBeatState {
  const s = load();
  if (typeof patch.enabled === 'boolean') s.enabled = patch.enabled;
  if (patch.dropMode === 'bb' || patch.dropMode === 'percent') s.dropMode = patch.dropMode;
  if (typeof patch.percent === 'number' && patch.percent >= 0) s.percent = patch.percent;
  if (patch.triggers && typeof patch.triggers === 'object') s.triggers = { ...s.triggers, ...patch.triggers };
  if (Array.isArray(patch.tiers) && patch.tiers.length) s.tiers = patch.tiers.map(sanitizeTier);
  save(s);
  return s;
}

// Отчисление в пул из раздачи (Фаза 2). Без записи в историю пополнений (это автодроп, не ручное).
export function addToPool(amount: number): void {
  const cents = Math.round(amount);
  if (!Number.isFinite(cents) || cents <= 0) return;
  const s = load();
  s.pool += cents;
  save(s);
}

// Сумма выплат бэд-бита за период [since, until] (null = без границы) — для карточки «Данные».
export function sumBadBeatHits(since: number | null, until: number | null): number {
  const s = load();
  let total = 0;
  for (const h of s.hits) {
    if (since !== null && h.ts < since) continue;
    if (until !== null && h.ts > until) continue;
    total += h.total;
  }
  return total;
}

// Выплата из пула при срабатывании (Фаза 3): уменьшить пул и записать срабатывание.
export function payoutFromPool(total: number, hit: BadBeatHit): void {
  const cents = Math.round(total);
  if (!Number.isFinite(cents) || cents <= 0) return;
  const s = load();
  s.pool = Math.max(0, s.pool - cents);
  s.hits = [hit, ...s.hits].slice(0, 200);
  save(s);
}

// Пополнение пула (admin). Сумма в центах. Пишет запись в историю.
export function topUpBadBeat(amount: number, by: string): BadBeatState {
  const s = load();
  const cents = Math.round(amount);
  if (!Number.isFinite(cents) || cents <= 0) return s;
  s.pool += cents;
  s.topups = [{ ts: Date.now(), amount: cents, by }, ...s.topups].slice(0, 200);
  save(s);
  return s;
}
