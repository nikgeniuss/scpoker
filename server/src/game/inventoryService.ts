// Инвентарь косметики (ROADMAP §10.21.11-12) — обмен HUB-коинов на визуальные предметы: рамка
// аватара / титул под ником (видны ВСЕМ за столом, десктоп+мобила), эксклюзивные эмодзи-реакции
// (можно слать в общую EmojiPalette, видны всем при отправке) и личная подсветка стола (видна
// ТОЛЬКО покупателю — чисто клиентская настройка, не транспортируется через GameState). Чисто
// декоративный слой — на игру не влияет, экономически бесплатен для рума (в отличие от тикетов
// не тратит призовой фонд, поэтому анти-фарм здесь не нужен — фарм-риска для рума нет).
// Рамка/подсветка — ключ из фиксированного набора стилей, клиент маппит в CSS; НЕ произвольный
// CSS из админки (риск инъекции). Титул/эмодзи — произвольный текст, санитизируется длиной и
// рендерится клиентом как обычный текст (не HTML).
// Источник правды — server/data/inventory.json (атомарно через writeJSON, §0.4). Файл в data/,
// nodemon не watch'ит (§0.3) — записи не рестартят сервер.
import { readJSON, writeJSON } from '../auth/storage.js';
import { debit as debitWallet } from './rewardsWalletService.js';

const FILE = 'inventory.json';
const TITLE_MAX_LEN = 24;
const EMOJI_MAX_LEN = 8; // с запасом под составные эмодзи (ZWJ-последовательности/вариационные селекторы)

export const FRAME_STYLES = ['bronze', 'silver', 'gold', 'emerald'] as const;
export type FrameStyle = (typeof FRAME_STYLES)[number];

export const TABLE_GLOW_STYLES = ['emerald', 'sapphire', 'ruby', 'violet'] as const;
export type TableGlowStyle = (typeof TABLE_GLOW_STYLES)[number];

export type CosmeticType = 'avatarFrame' | 'title' | 'emoji' | 'tableGlow';
// Экипируемые типы — один активный предмет на слот (как рамка/титул). Эмодзи — НЕ экипируется:
// владение само по себе разрешает слать его в EmojiPalette, можно использовать сколько угодно
// купленных эмодзи одновременно (не единственный слот).
export type EquippableCosmeticType = 'avatarFrame' | 'title' | 'tableGlow';

export interface CosmeticItem {
  id: string;
  type: CosmeticType;
  name: string;  // название в магазине/админке
  cost: number;  // HUB-коины
  // avatarFrame: ключ из FRAME_STYLES; tableGlow: ключ из TABLE_GLOW_STYLES;
  // title: отображаемый текст (≤24 симв.); emoji: сам символ (≤8 симв.)
  value: string;
}

interface EquippedSet {
  frame?: string;
  title?: string;
  tableGlow?: string;
}

interface InventoryState {
  enabled: boolean;
  catalog: CosmeticItem[];
  owned: Record<string, string[]>; // userId -> itemId[]
  equipped: Record<string, EquippedSet>; // userId -> itemId экипированных предметов (по слотам)
}

const DEFAULT_CATALOG: CosmeticItem[] = [
  { id: 'frame-bronze', type: 'avatarFrame', name: 'Бронзовая рамка', cost: 200, value: 'bronze' },
  { id: 'frame-silver', type: 'avatarFrame', name: 'Серебряная рамка', cost: 600, value: 'silver' },
  { id: 'frame-gold', type: 'avatarFrame', name: 'Золотая рамка', cost: 1500, value: 'gold' },
  { id: 'frame-emerald', type: 'avatarFrame', name: 'Изумрудная рамка', cost: 3000, value: 'emerald' },
  { id: 'title-regular', type: 'title', name: 'Титул «Регуляр»', cost: 150, value: 'Регуляр' },
  { id: 'title-shark', type: 'title', name: 'Титул «🦈 Акула стола»', cost: 400, value: '🦈 Акула стола' },
  { id: 'title-legend', type: 'title', name: 'Титул «Легенда»', cost: 1000, value: 'Легенда' },
  { id: 'emoji-shark', type: 'emoji', name: 'Эксклюзивное эмодзи 🦈', cost: 300, value: '🦈' },
  { id: 'emoji-crown', type: 'emoji', name: 'Эксклюзивное эмодзи 👑', cost: 500, value: '👑' },
  { id: 'glow-emerald', type: 'tableGlow', name: 'Подсветка стола: изумруд', cost: 400, value: 'emerald' },
  { id: 'glow-sapphire', type: 'tableGlow', name: 'Подсветка стола: сапфир', cost: 400, value: 'sapphire' },
  { id: 'glow-ruby', type: 'tableGlow', name: 'Подсветка стола: рубин', cost: 400, value: 'ruby' },
  { id: 'glow-violet', type: 'tableGlow', name: 'Подсветка стола: аметист', cost: 400, value: 'violet' },
];

function defaults(): InventoryState {
  return { enabled: false, catalog: DEFAULT_CATALOG.map((i) => ({ ...i })), owned: {}, equipped: {} };
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);

const COSMETIC_TYPES: readonly CosmeticType[] = ['avatarFrame', 'title', 'emoji', 'tableGlow'];

function sanitizeItem(raw: unknown): CosmeticItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<CosmeticItem>;
  if (typeof r.id !== 'string' || !r.id.trim()) return null;
  const type: CosmeticType = COSMETIC_TYPES.includes(r.type as CosmeticType) ? (r.type as CosmeticType) : 'avatarFrame';
  let value = typeof r.value === 'string' ? r.value.trim() : '';
  if (type === 'avatarFrame') {
    if (!(FRAME_STYLES as readonly string[]).includes(value)) value = FRAME_STYLES[0];
  } else if (type === 'tableGlow') {
    if (!(TABLE_GLOW_STYLES as readonly string[]).includes(value)) value = TABLE_GLOW_STYLES[0];
  } else if (type === 'emoji') {
    value = value.slice(0, EMOJI_MAX_LEN) || '⭐';
  } else {
    value = value.slice(0, TITLE_MAX_LEN) || 'Титул';
  }
  return {
    id: r.id.trim(),
    type,
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim() : 'Предмет',
    cost: Math.max(0, num(r.cost, 0)),
    value,
  };
}

function sanitizeCatalog(v: unknown): CosmeticItem[] {
  if (!Array.isArray(v)) return [];
  const out: CosmeticItem[] = [];
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

function sanitizeOwned(v: unknown): Record<string, string[]> {
  if (!v || typeof v !== 'object') return {};
  const out: Record<string, string[]> = {};
  for (const [id, raw] of Object.entries(v as Record<string, unknown>)) {
    if (Array.isArray(raw)) out[id] = raw.filter((x): x is string => typeof x === 'string');
  }
  return out;
}

function sanitizeEquipped(v: unknown): Record<string, EquippedSet> {
  if (!v || typeof v !== 'object') return {};
  const out: Record<string, EquippedSet> = {};
  for (const [id, raw] of Object.entries(v as Record<string, Partial<EquippedSet>>)) {
    const frame = typeof raw?.frame === 'string' ? raw.frame : undefined;
    const title = typeof raw?.title === 'string' ? raw.title : undefined;
    const tableGlow = typeof raw?.tableGlow === 'string' ? raw.tableGlow : undefined;
    if (frame || title || tableGlow) out[id] = { frame, title, tableGlow };
  }
  return out;
}

function load(): InventoryState {
  try {
    const s = readJSON(FILE) as Partial<InventoryState>;
    const d = defaults();
    const catalog = sanitizeCatalog(s.catalog);
    return {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : d.enabled,
      catalog: catalog.length ? catalog : d.catalog,
      owned: sanitizeOwned(s.owned),
      equipped: sanitizeEquipped(s.equipped),
    };
  } catch {
    return defaults();
  }
}

function save(s: InventoryState): void {
  writeJSON(FILE, s);
}

export function getCatalog(): { enabled: boolean; catalog: CosmeticItem[] } {
  const s = load();
  return { enabled: s.enabled, catalog: s.catalog };
}

export function updateInventorySettings(
  patch: Partial<{ enabled: boolean; catalog: CosmeticItem[] }>,
): { enabled: boolean; catalog: CosmeticItem[] } {
  const s = load();
  if (typeof patch.enabled === 'boolean') s.enabled = patch.enabled;
  if (Array.isArray(patch.catalog)) {
    const sanitized = sanitizeCatalog(patch.catalog);
    if (sanitized.length) s.catalog = sanitized;
  }
  save(s);
  return { enabled: s.enabled, catalog: s.catalog };
}

export interface UserInventoryInfo {
  enabled: boolean;
  catalog: CosmeticItem[];
  owned: string[];
  equipped: EquippedSet;
}

// Личный инвентарь игрока (для страницы «Магазин» — каталог + что уже куплено/надето).
export function getUserInventory(userId: string): UserInventoryInfo {
  const s = load();
  return { enabled: s.enabled, catalog: s.catalog, owned: s.owned[userId] ?? [], equipped: s.equipped[userId] ?? {} };
}

export type PurchaseResult = { ok: true } | { error: string };

// Покупка предмета — HUB-коины списываются один раз, предмет остаётся в инвентаре навсегда.
export function purchaseItem(userId: string, itemId: string): PurchaseResult {
  const s = load();
  if (!s.enabled) return { error: 'shop-disabled' };
  const item = s.catalog.find((i) => i.id === itemId);
  if (!item) return { error: 'item-not-found' };
  const owned = s.owned[userId] ?? [];
  if (owned.includes(itemId)) return { error: 'already-owned' };
  const balance = debitWallet(userId, item.cost, 'shop', itemId);
  if (balance === null) return { error: 'insufficient-balance' };
  s.owned[userId] = [...owned, itemId];
  save(s);
  return { ok: true };
}

export type EquipResult = { ok: true; equipped: EquippedSet } | { error: string };

const SLOT_KEY: Record<EquippableCosmeticType, keyof EquippedSet> = {
  avatarFrame: 'frame',
  title: 'title',
  tableGlow: 'tableGlow',
};

// Экипировка/снятие предмета (только для EquippableCosmeticType — эмодзи не экипируется,
// достаточно владения). itemId=null — снять текущий предмет этого типа.
export function equipItem(userId: string, itemId: string | null, type: EquippableCosmeticType): EquipResult {
  const s = load();
  const equipped: EquippedSet = { ...(s.equipped[userId] ?? {}) };
  const slot = SLOT_KEY[type];
  if (itemId === null) {
    delete equipped[slot];
  } else {
    const owned = s.owned[userId] ?? [];
    if (!owned.includes(itemId)) return { error: 'not-owned' };
    const item = s.catalog.find((i) => i.id === itemId);
    if (!item || item.type !== type) return { error: 'item-not-found' };
    equipped[slot] = itemId;
  }
  s.equipped[userId] = equipped;
  save(s);
  return { ok: true, equipped };
}

// Резолв экипированных рамки/титула в отображаемые значения (frame-style-key / title-text) —
// это ЕДИНСТВЕННЫЕ два слота, которые уходят в GameState (видны другим игрокам за столом).
// Вызывается ОДИН РАЗ при посадке (как avatarSeed из users.json) — НЕ на каждый
// broadcastGameState, чтобы не плодить лишние чтения диска на игровом хот-пути (§0.10).
// tableGlow сюда сознательно НЕ входит — личная подсветка стола видна только владельцу,
// клиент резолвит её сам из уже полученного /api/inventory/me, транспорт не нужен.
export function getResolvedEquipped(userId: string): { frame?: string; title?: string } {
  const s = load();
  const eq = s.equipped[userId];
  if (!eq) return {};
  const frameItem = eq.frame ? s.catalog.find((i) => i.id === eq.frame && i.type === 'avatarFrame') : undefined;
  const titleItem = eq.title ? s.catalog.find((i) => i.id === eq.title && i.type === 'title') : undefined;
  return { frame: frameItem?.value, title: titleItem?.value };
}

// Владеет ли игрок эксклюзивным эмодзи с таким символом — вызывается СЕРВЕРОМ перед broadcast
// в registerSocketHandlers.ts (SEND_EMOJI), чтобы клиент не мог подделать пакет и слать премиум-
// эмодзи бесплатно (владение — не просто UI-гейт в палитре, а реальная проверка на сервере).
export function isEmojiOwned(userId: string, emoji: string): boolean {
  const s = load();
  const owned = s.owned[userId] ?? [];
  return s.catalog.some((i) => i.type === 'emoji' && i.value === emoji && owned.includes(i.id));
}
