import { readJSON, writeJSON } from '../auth/storage.js';

// Подписка на HUD соперников (ROADMAP §10.21.13). Когда админ включил платный режим
// (`paidFeatures.hudMode === 'paid'`), VPIP/PFR соперников уходят только тем, у кого подписка
// активна. Сам гейт — в gameStateSerializer.ts (§0.1-аналог: прятать на клиенте бесполезно,
// статистику видно в DevTools), здесь только хранение сроков.
// Источник правды — server/data/hud-subscriptions.json (атомарно через writeJSON, §0.3).
const FILE = 'hud-subscriptions.json';

// userId → expiresAt (epoch ms). Одна подписка на аккаунт: покупка не заводит вторую, а продлевает.
export type HudSubscriptionState = Record<string, number>;

// === Чистая часть ===

export function isActive(expiresAt: number | undefined, now: number): boolean {
  return typeof expiresAt === 'number' && expiresAt > now;
}

// Продление считается от текущей даты окончания, а НЕ от «сейчас» — иначе покупка за день до
// конца сжигала бы остаток. Истёкшая (или отсутствующая) подписка отсчитывается от now.
export function extend(current: number | undefined, now: number, days: number): number {
  const base = isActive(current, now) ? current! : now;
  return base + days * 86_400_000;
}

// Ленивая чистка истёкших записей на записи — как в ratholeService.ts, иначе файл растёт вечно.
export function pruneExpired(state: HudSubscriptionState, now: number): HudSubscriptionState {
  const out: HudSubscriptionState = {};
  for (const [userId, expiresAt] of Object.entries(state)) {
    if (isActive(expiresAt, now)) out[userId] = expiresAt;
  }
  return out;
}

// === Файловые обёртки ===

// Кэш в памяти: проверка подписки идёт из broadcastGameState — на каждый сокет каждого броадкаста
// (13 раз за раздачу × число игроков), а readJSON без pending-записи делает реальный readFileSync.
// Единственный писатель файла — grant() ниже, поэтому кэш авторитетен. Правка файла руками
// подхватится только после рестарта сервера.
let cache: HudSubscriptionState | null = null;

// Сброс кэша — для тестов (они подменяют storage и чистят его между кейсами).
export function resetCache(): void {
  cache = null;
}

function load(): HudSubscriptionState {
  if (cache) return cache;
  try {
    const v = readJSON(FILE) as HudSubscriptionState;
    const out: HudSubscriptionState = {};
    if (v && typeof v === 'object') {
      for (const [userId, expiresAt] of Object.entries(v)) {
        if (typeof expiresAt === 'number' && Number.isFinite(expiresAt)) out[userId] = expiresAt;
      }
    }
    cache = out;
    return out;
  } catch {
    cache = {}; // файла ещё нет или повреждён — подписок просто нет
    return cache;
  }
}

export function getExpiresAt(userId: string): number | undefined {
  return load()[userId];
}

export function hasActive(userId: string, now = Date.now()): boolean {
  return isActive(load()[userId], now);
}

// Выдать/продлить подписку. Возвращает новую дату окончания.
export function grant(userId: string, days: number, now = Date.now()): number {
  const state = pruneExpired(load(), now);
  const next = extend(state[userId], now, days);
  state[userId] = next;
  cache = state;
  writeJSON(FILE, state);
  return next;
}
