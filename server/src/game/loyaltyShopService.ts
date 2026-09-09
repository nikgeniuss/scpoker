// Магазин лояльности (ROADMAP §10.21.6) — обмен HUB-коинов на house-funded вход в турнир.
// НЕ трогает TournamentManager.ts ни строкой — редемпшн композирует уже существующие публичные
// методы (createPromoCode + redeemPromoCode, тот же механизм, что у обычных промокодов): рум
// платит бай-ин в prizePool за игрока, банкролл не списывается (см. shop.routes.ts).
// Каталог — admin-CRUD, все суммы cost — HUB-коины, ticketBuyIn — реальные фишки (бай-ин
// турнира, который покрывает тикет). Анти-фарм (см. вступление к §10.21) — тот же IP/device-
// примитив, что у стрика/рефералки: несколько аккаунтов с одного устройства не смогут по очереди
// обменивать HUB-коины на sponsored-входы — это реальная утечка призового фонда рума.
// Источник правды — server/data/loyalty-shop.json (атомарно через writeJSON, §0.4).
import { readJSON, writeJSON } from '../auth/storage.js';
import { hasNetworkCollision, type NetworkInfo } from './antiCollusion.js';
import { debit as debitWallet, credit as creditWallet } from './rewardsWalletService.js';
import { grant as grantHudSubscription, getExpiresAt as getHudExpiresAt } from './hudSubscriptionService.js';
import type { TournamentManager } from './tournament/TournamentManager.js';
import type { TournamentInfo } from '@poker-room/shared';

const FILE = 'loyalty-shop.json';
const NETWORK_CAP = 1000;

export interface ShopItem {
  id: string;
  title: string;
  cost: number;        // HUB-коины
  ticketBuyIn: number;  // фишки — бай-ин турнира, который покрывает тикет (только kind='ticket')
  // Тип позиции: тикет в турнир (как было) либо подписка на HUD соперников (§10.21.13).
  kind: 'ticket' | 'hudSub';
  subDays: number;      // срок подписки в днях (только kind='hudSub')
}

interface NetworkClaim extends NetworkInfo {
  userId: string;
  t: number;
}

interface ShopState {
  enabled: boolean;
  catalog: ShopItem[];
  networkClaims: NetworkClaim[];
}

const DEFAULT_CATALOG: ShopItem[] = [
  { id: 'ticket-100', title: 'Тикет на турнир (бай-ин 100)', cost: 300, ticketBuyIn: 100, kind: 'ticket', subDays: 0 },
  { id: 'ticket-500', title: 'Тикет на турнир (бай-ин 500)', cost: 1200, ticketBuyIn: 500, kind: 'ticket', subDays: 0 },
  { id: 'hud-sub-30', title: 'HUD соперников — 30 дней', cost: 500, ticketBuyIn: 0, kind: 'hudSub', subDays: 30 },
];

function defaults(): ShopState {
  return { enabled: false, catalog: DEFAULT_CATALOG.map((i) => ({ ...i })), networkClaims: [] };
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);

function sanitizeItem(raw: unknown): ShopItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<ShopItem>;
  if (typeof r.id !== 'string' || !r.id.trim()) return null;
  // Старые записи каталога (до §10.21.13) поля kind/subDays не имеют — это тикеты.
  const kind: ShopItem['kind'] = r.kind === 'hudSub' ? 'hudSub' : 'ticket';
  return {
    id: r.id.trim(),
    title: typeof r.title === 'string' && r.title.trim() ? r.title.trim() : 'Тикет',
    cost: Math.max(0, num(r.cost, 0)),
    ticketBuyIn: Math.max(0, num(r.ticketBuyIn, 0)),
    kind,
    subDays: kind === 'hudSub' ? Math.max(0, num(r.subDays, 0)) : 0,
  };
}

function sanitizeCatalog(v: unknown): ShopItem[] {
  if (!Array.isArray(v)) return [];
  const out: ShopItem[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    const item = sanitizeItem(raw);
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

function sanitizeNetworkClaims(v: unknown): NetworkClaim[] {
  if (!Array.isArray(v)) return [];
  const out: NetworkClaim[] = [];
  for (const raw of v as Partial<NetworkClaim>[]) {
    if (!raw || typeof raw.userId !== 'string') continue;
    out.push({
      userId: raw.userId,
      ip: typeof raw.ip === 'string' ? raw.ip : '',
      deviceId: typeof raw.deviceId === 'string' ? raw.deviceId : '',
      t: num(raw.t, Date.now()),
    });
  }
  return out.slice(-NETWORK_CAP);
}

function load(): ShopState {
  try {
    const s = readJSON(FILE) as Partial<ShopState>;
    const d = defaults();
    const catalog = sanitizeCatalog(s.catalog);
    return {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : d.enabled,
      catalog: catalog.length ? catalog : d.catalog,
      networkClaims: sanitizeNetworkClaims(s.networkClaims),
    };
  } catch {
    return defaults();
  }
}

function save(s: ShopState): void {
  writeJSON(FILE, s);
}

export function getShopCatalog(): { enabled: boolean; catalog: ShopItem[] } {
  const s = load();
  return { enabled: s.enabled, catalog: s.catalog };
}

export function updateShopSettings(patch: Partial<{ enabled: boolean; catalog: ShopItem[] }>): { enabled: boolean; catalog: ShopItem[] } {
  const s = load();
  if (typeof patch.enabled === 'boolean') s.enabled = patch.enabled;
  if (Array.isArray(patch.catalog)) {
    const sanitized = sanitizeCatalog(patch.catalog);
    if (sanitized.length) s.catalog = sanitized;
  }
  save(s);
  return { enabled: s.enabled, catalog: s.catalog };
}

export function getShopItem(itemId: string): ShopItem | null {
  return load().catalog.find((i) => i.id === itemId) ?? null;
}

// Анти-фарм — то же устройство/IP уже редимило sponsored-вход для ДРУГОГО userId?
export function isRedemptionBlocked(userId: string, network: NetworkInfo): boolean {
  const s = load();
  const others = s.networkClaims.filter((c) => c.userId !== userId);
  return hasNetworkCollision(others, network);
}

export function recordRedemption(userId: string, network: NetworkInfo): void {
  const s = load();
  s.networkClaims = [...s.networkClaims, { ...network, userId, t: Date.now() }].slice(-NETWORK_CAP);
  save(s);
}

export type RedeemResult = { ok: true; tournament: TournamentInfo } | { error: string };

// Оркестрация редемпшена — house-funded вход в турнир. НЕ трогает TournamentManager.ts ни строкой:
// композирует его же публичные createPromoCode+redeemPromoCode (тот же путь, что у обычных
// промокодов — рум платит бай-ин в prizePool, банкролл не списывается). При неудаче на любом шаге
// после списания — HUB-коины возвращаются (см. shop.routes.ts для HTTP-обёртки).
export function redeemShopItem(
  tournamentManager: TournamentManager,
  userId: string,
  username: string,
  itemId: string,
  tournamentId: string,
  network: NetworkInfo,
): RedeemResult {
  const item = getShopItem(itemId);
  if (!item) return { error: 'item-not-found' };
  if (item.kind !== 'ticket') return { error: 'not-a-ticket' };

  const tournament = tournamentManager.get(tournamentId);
  if (!tournament) return { error: 'tournament-not-found' };
  if (tournament.buyIn !== item.ticketBuyIn) return { error: 'buyin-mismatch' };

  if (isRedemptionBlocked(userId, network)) return { error: 'network-blocked' };

  const balance = debitWallet(userId, item.cost, 'shop', itemId);
  if (balance === null) return { error: 'insufficient-balance' };

  const promo = tournamentManager.createPromoCode(item.ticketBuyIn, 1, `shop:${userId}`);
  if ('error' in promo) {
    creditWallet(userId, item.cost, 'shop', `${itemId}:refund`); // откат — покупка не состоялась
    return promo;
  }

  const result = tournamentManager.redeemPromoCode(tournamentId, userId, username, promo.code);
  if ('error' in result) {
    creditWallet(userId, item.cost, 'shop', `${itemId}:refund`);
    tournamentManager.deactivatePromoCode(promo.code);
    return result;
  }

  recordRedemption(userId, network);
  return { ok: true, tournament: result };
}

export type SubscribeResult = { ok: true; expiresAt: number } | { error: string };

// Покупка подписки на HUD соперников (§10.21.13) за HUB-коины. Анти-фарм по сети здесь НЕ нужен:
// в отличие от тикета, подписка не оплачивается румом (не трогает призовой фонд) — игрок тратит
// свои HUB на персональную фичу. Проверка баланса и списание — на сервере (§0.13).
export function redeemSubscription(userId: string, itemId: string, now = Date.now()): SubscribeResult {
  const item = getShopItem(itemId);
  if (!item) return { error: 'item-not-found' };
  if (item.kind !== 'hudSub') return { error: 'not-a-subscription' };
  if (item.subDays <= 0) return { error: 'invalid-item' };

  const balance = debitWallet(userId, item.cost, 'shop', itemId);
  if (balance === null) return { error: 'insufficient-balance' };

  try {
    // Продление считается от текущей даты окончания (см. hudSubscriptionService.extend) —
    // покупка за день до конца не сжигает остаток.
    const expiresAt = grantHudSubscription(userId, item.subDays, now);
    return { ok: true, expiresAt };
  } catch {
    creditWallet(userId, item.cost, 'shop', itemId + ':refund'); // откат — подписка не выдана
    return { error: 'subscription-failed' };
  }
}

// Статус подписки для клиента (магазин и попап за столом).
export function getSubscriptionStatus(userId: string, now = Date.now()): { expiresAt: number | null; active: boolean } {
  const expiresAt = getHudExpiresAt(userId);
  return { expiresAt: expiresAt ?? null, active: typeof expiresAt === 'number' && expiresAt > now };
}
