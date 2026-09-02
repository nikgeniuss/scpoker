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
import type { TournamentManager } from './tournament/TournamentManager.js';
import type { TournamentInfo } from '@poker-room/shared';

const FILE = 'loyalty-shop.json';
const NETWORK_CAP = 1000;

export interface ShopItem {
  id: string;
  title: string;
  cost: number;        // HUB-коины
  ticketBuyIn: number;  // фишки — бай-ин турнира, который покрывает тикет
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
  { id: 'ticket-100', title: 'Тикет на турнир (бай-ин 100)', cost: 300, ticketBuyIn: 100 },
  { id: 'ticket-500', title: 'Тикет на турнир (бай-ин 500)', cost: 1200, ticketBuyIn: 500 },
];

function defaults(): ShopState {
  return { enabled: false, catalog: DEFAULT_CATALOG.map((i) => ({ ...i })), networkClaims: [] };
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);

function sanitizeItem(raw: unknown): ShopItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<ShopItem>;
  if (typeof r.id !== 'string' || !r.id.trim()) return null;
  return {
    id: r.id.trim(),
    title: typeof r.title === 'string' && r.title.trim() ? r.title.trim() : 'Тикет',
    cost: Math.max(0, num(r.cost, 0)),
    ticketBuyIn: Math.max(0, num(r.ticketBuyIn, 0)),
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
