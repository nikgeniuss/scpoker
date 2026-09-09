// Депозитный бонус с отыгрышем рейком (ROADMAP §10.21.9). Бонус выдаётся на депозит и лежит
// запертым: за каждые `rakeMultiplier` единиц уплаченного игроком рейка открывается 1 единица
// бонуса. Открытую часть игрок забирает сам кнопкой — молча в стек посреди раздачи ничего не
// падает, забранное уходит в банкролл (§0 банкролл). Неоткрытый остаток сгорает по истечении
// срока; уже открытое, но не забранное, сгоранию не подлежит.
// Валюта выплаты переключается админом: 'chips' — реальные фишки (через инжектируемый creditor,
// чтобы модуль не тянул payments и не заводил цикл импорта), 'hub' — HUB-коины (rewardsWalletService).
// Источник правды — server/data/deposit-bonus.json (атомарно через writeJSON, §0.4). Файл в data/,
// nodemon не watch'ит (§0.3) — записи не рестартят сервер.
import { readJSON, writeJSON } from '../auth/storage.js';
import { credit as creditRewardsWallet } from './rewardsWalletService.js';

const FILE = 'deposit-bonus.json';

export type BonusCurrency = 'chips' | 'hub';

export interface DepositBonusConfig {
  enabled: boolean;
  currency: BonusCurrency;
  firstPercent: number;     // % от суммы первого депозита
  reloadPercent: number;    // % от суммы повторных депозитов
  maxBonusAmount: number;   // потолок суммы ОДНОГО бонуса (в единицах выбранной валюты)
  minDepositChips: number;  // депозит меньше этого бонуса не даёт (центы фишек)
  rakeMultiplier: number;   // сколько рейка нужно отыграть на 1 единицу бонуса
  lifetimeDays: number;     // срок жизни бонуса с момента выдачи
  countTournamentRake: boolean; // засчитывать ли турнирную комиссию наравне с кэш-рейком
}

export interface DepositBonus {
  id: string;
  userId: string;
  currency: BonusCurrency;
  amount: number;        // полная сумма бонуса
  rakeRequired: number;  // рейк для полного открытия — зафиксирован при выдаче
  rakeAccrued: number;   // сколько рейка уже зачтено этому бонусу
  released: number;      // сколько бонуса открыто отыгрышем (≤ amount)
  claimed: number;       // сколько игрок уже забрал (≤ released)
  grantedAt: number;
  expiresAt: number;
  source: 'first' | 'reload';
  depositTxid?: string;
}

interface DepositBonusState {
  config: DepositBonusConfig;
  bonuses: DepositBonus[];
}

// Дефолт — фича ВЫКЛЮЧЕНА: обновление не должно начать раздавать деньги на живом руме,
// включение и выбор валюты — осознанное действие админа (решение пользователя 2026-09-08).
const DEFAULT_CONFIG: DepositBonusConfig = {
  enabled: false,
  currency: 'hub',
  firstPercent: 100,
  reloadPercent: 50,
  maxBonusAmount: 50_000,
  minDepositChips: 1_000,
  rakeMultiplier: 3,
  lifetimeDays: 30,
  countTournamentRake: true,
};

const DAY_MS = 86_400_000;

function defaults(): DepositBonusState {
  return { config: { ...DEFAULT_CONFIG }, bonuses: [] };
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);

function sanitizeConfig(v: unknown): DepositBonusConfig {
  const raw = (v ?? {}) as Partial<DepositBonusConfig>;
  const d = DEFAULT_CONFIG;
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : d.enabled,
    currency: raw.currency === 'chips' ? 'chips' : 'hub',
    firstPercent: Math.min(1000, num(raw.firstPercent, d.firstPercent)),
    reloadPercent: Math.min(1000, num(raw.reloadPercent, d.reloadPercent)),
    maxBonusAmount: Math.round(num(raw.maxBonusAmount, d.maxBonusAmount)),
    minDepositChips: Math.round(num(raw.minDepositChips, d.minDepositChips)),
    // Множитель 0 сделал бы бонус мгновенно открытым — это уже другая механика, поэтому минимум 0.1.
    rakeMultiplier: Math.max(0.1, num(raw.rakeMultiplier, d.rakeMultiplier)),
    lifetimeDays: Math.max(1, Math.round(num(raw.lifetimeDays, d.lifetimeDays))),
    countTournamentRake: typeof raw.countTournamentRake === 'boolean' ? raw.countTournamentRake : d.countTournamentRake,
  };
}

function sanitizeBonus(v: unknown): DepositBonus | null {
  if (!v || typeof v !== 'object') return null;
  const raw = v as Partial<DepositBonus>;
  if (typeof raw.id !== 'string' || typeof raw.userId !== 'string') return null;
  const amount = Math.round(num(raw.amount, 0));
  if (amount <= 0) return null;
  const grantedAt = num(raw.grantedAt, Date.now());
  return {
    id: raw.id,
    userId: raw.userId,
    currency: raw.currency === 'chips' ? 'chips' : 'hub',
    amount,
    rakeRequired: Math.max(1, Math.round(num(raw.rakeRequired, amount))),
    rakeAccrued: Math.round(num(raw.rakeAccrued, 0)),
    released: Math.min(amount, Math.round(num(raw.released, 0))),
    claimed: Math.min(amount, Math.round(num(raw.claimed, 0))),
    grantedAt,
    expiresAt: num(raw.expiresAt, grantedAt + DEFAULT_CONFIG.lifetimeDays * DAY_MS),
    source: raw.source === 'first' ? 'first' : 'reload',
    ...(typeof raw.depositTxid === 'string' ? { depositTxid: raw.depositTxid } : {}),
  };
}

function sanitizeBonuses(v: unknown): DepositBonus[] {
  if (!Array.isArray(v)) return [];
  const out: DepositBonus[] = [];
  for (const raw of v) {
    const b = sanitizeBonus(raw);
    if (b) out.push(b);
  }
  return out.sort((a, b) => a.grantedAt - b.grantedAt); // FIFO-порядок хранится сразу отсортированным
}

function load(): DepositBonusState {
  try {
    const s = readJSON(FILE) as Partial<DepositBonusState>;
    return { config: sanitizeConfig(s.config), bonuses: sanitizeBonuses(s.bonuses) };
  } catch {
    return defaults();
  }
}

function save(s: DepositBonusState): void {
  writeJSON(FILE, s);
}

// ===== Чистые функции (тестируются отдельно от хранилища) =====

// Сумма бонуса за депозит. Депозит меньше минимального бонуса не даёт; результат режется потолком.
export function computeBonusAmount(depositChips: number, isFirst: boolean, cfg: DepositBonusConfig): number {
  if (!cfg.enabled || depositChips < cfg.minDepositChips) return 0;
  const percent = isFirst ? cfg.firstPercent : cfg.reloadPercent;
  if (percent <= 0) return 0;
  return Math.min(cfg.maxBonusAmount, Math.floor((depositChips * percent) / 100));
}

// Бонус ещё принимает рейк: срок не истёк и открыто не всё.
export function isAccruing(b: DepositBonus, now: number): boolean {
  return now < b.expiresAt && b.released < b.amount;
}

// Открытая, но не забранная часть — она НЕ сгорает вместе со сроком.
export function availableOf(b: DepositBonus): number {
  return Math.max(0, b.released - b.claimed);
}

// Пересчёт открытой части по зачтённому рейку — доля от суммы бонуса, не более неё самой.
export function releasedFor(b: DepositBonus): number {
  if (b.rakeRequired <= 0) return b.amount;
  return Math.min(b.amount, Math.floor((b.amount * b.rakeAccrued) / b.rakeRequired));
}

// Распределение уплаченного рейка по очереди бонусов (FIFO — сначала самый старый). Мутирует
// переданные бонусы, возвращает, сколько бонуса открылось суммарно. Остаток рейка, которому не
// хватило незакрытых бонусов, просто пропадает — это не «долг» рума перед игроком.
export function applyRakeFifo(bonuses: DepositBonus[], rake: number, now: number): number {
  if (rake <= 0) return 0;
  let remaining = rake;
  let releasedTotal = 0;
  for (const b of bonuses) {
    if (remaining <= 0) break;
    if (!isAccruing(b, now)) continue;
    const needed = Math.max(0, b.rakeRequired - b.rakeAccrued);
    if (needed <= 0) continue;
    const take = Math.min(remaining, needed);
    b.rakeAccrued += take;
    remaining -= take;
    const releasedNow = releasedFor(b);
    releasedTotal += Math.max(0, releasedNow - b.released);
    b.released = releasedNow;
  }
  return releasedTotal;
}

// Бонус закрыт и больше не нужен в файле: всё забрано, либо срок истёк и забирать нечего.
export function isFinished(b: DepositBonus, now: number): boolean {
  if (b.claimed >= b.amount) return true;
  return now >= b.expiresAt && availableOf(b) <= 0;
}

// ===== Конфиг =====

export function getConfig(): DepositBonusConfig {
  return load().config;
}

export function updateSettings(patch: Partial<DepositBonusConfig>): DepositBonusConfig {
  const s = load();
  s.config = sanitizeConfig({ ...s.config, ...patch });
  save(s);
  return s.config;
}

// ===== Начисление реальных фишек — инжектируется из index.ts (§0.10: модуль не тянет payments) =====

type ChipsCreditor = (userId: string, amount: number) => boolean;

let creditChips: ChipsCreditor = () => false;

export function setChipsCreditor(fn: ChipsCreditor): void {
  creditChips = fn;
}

// ===== Операции =====

// Выдать бонус за зачисленный депозит. null — фича выключена, депозит мал или процент нулевой.
export function grantForDeposit(
  userId: string,
  depositChips: number,
  isFirst: boolean,
  depositTxid?: string,
  now = Date.now(),
): DepositBonus | null {
  const s = load();
  const amount = computeBonusAmount(depositChips, isFirst, s.config);
  if (amount <= 0) return null;

  const bonus: DepositBonus = {
    id: `${userId}:${now}`,
    userId,
    // Валюта фиксируется на момент выдачи: переключение настройки не должно менять природу
    // уже выданных бонусов (игрок увидел «в фишках» — заберёт в фишках).
    currency: s.config.currency,
    amount,
    rakeRequired: Math.max(1, Math.ceil(amount * s.config.rakeMultiplier)),
    rakeAccrued: 0,
    released: 0,
    claimed: 0,
    grantedAt: now,
    expiresAt: now + s.config.lifetimeDays * DAY_MS,
    source: isFirst ? 'first' : 'reload',
    ...(depositTxid ? { depositTxid } : {}),
  };
  s.bonuses = [...s.bonuses, bonus].sort((a, b) => a.grantedAt - b.grantedAt);
  save(s);
  return bonus;
}

// Зачесть уплаченный игроком рейк (кэш-раздача или турнирная комиссия). Возвращает, сколько
// бонуса открылось — 0 при выключенной фиче и при отсутствии активных бонусов (частый случай,
// поэтому выходим до записи файла: рейк капает на каждой раздаче каждого стола).
export function accrueRake(userId: string, rake: number, now = Date.now()): number {
  if (rake <= 0) return 0;
  const s = load();
  if (!s.config.enabled) return 0;
  const mine = s.bonuses.filter((b) => b.userId === userId && isAccruing(b, now));
  if (mine.length === 0) return 0;

  const released = applyRakeFifo(mine, rake, now);
  save(s); // mine — ссылки на объекты из s.bonuses, мутации уже в состоянии
  return released;
}

// Турнирная комиссия в зачёт отыгрыша — отдельной точкой входа, потому что источник
// отключается настройкой countTournamentRake (кэш-рейк засчитывается всегда).
export function accrueTournamentRake(userId: string, rake: number, now = Date.now()): number {
  if (rake <= 0) return 0;
  if (!load().config.countTournamentRake) return 0;
  return accrueRake(userId, rake, now);
}

export interface UserBonusView {
  enabled: boolean;
  currency: BonusCurrency;
  rakeMultiplier: number;
  firstPercent: number;
  reloadPercent: number;
  available: number;   // доступно к получению прямо сейчас
  locked: number;      // ещё заперто (открывается рейком)
  totalGranted: number;
  totalClaimed: number;
  bonuses: DepositBonus[];
}

// Личный кабинет игрока: прогресс отыгрыша по каждому бонусу + сколько доступно забрать.
export function getUserBonusState(userId: string, now = Date.now()): UserBonusView {
  const s = load();
  const mine = s.bonuses.filter((b) => b.userId === userId);
  let available = 0;
  let locked = 0;
  let totalGranted = 0;
  let totalClaimed = 0;
  for (const b of mine) {
    available += availableOf(b);
    if (isAccruing(b, now)) locked += b.amount - b.released;
    totalGranted += b.amount;
    totalClaimed += b.claimed;
  }
  return {
    enabled: s.config.enabled,
    currency: s.config.currency,
    rakeMultiplier: s.config.rakeMultiplier,
    firstPercent: s.config.firstPercent,
    reloadPercent: s.config.reloadPercent,
    available,
    locked,
    totalGranted,
    totalClaimed,
    bonuses: mine,
  };
}

export type ClaimResult =
  | { ok: true; chips: number; hub: number }
  | { error: string };

// Забрать всё, что открыто на данный момент. Бонусы могут быть в разных валютах (валюта
// зафиксирована при выдаче), поэтому суммы возвращаются раздельно. Списание с бонуса делается
// ТОЛЬКО после успешного начисления — сбой creditor'а не должен «съедать» открытую часть.
export function claim(userId: string, now = Date.now()): ClaimResult {
  const s = load();
  const mine = s.bonuses.filter((b) => b.userId === userId && availableOf(b) > 0);
  if (mine.length === 0) return { error: 'nothing-to-claim' };

  let chips = 0;
  let hub = 0;
  for (const b of mine) {
    const amount = availableOf(b);
    if (b.currency === 'chips') {
      if (!creditChips(b.userId, amount)) continue; // юзер не найден/банкролл недоступен — оставляем на следующий раз
      chips += amount;
    } else {
      creditRewardsWallet(b.userId, amount, 'bonus', b.id);
      hub += amount;
    }
    b.claimed += amount;
  }
  if (chips === 0 && hub === 0) return { error: 'claim-failed' };

  s.bonuses = s.bonuses.filter((b) => !isFinished(b, now));
  save(s);
  return { ok: true, chips, hub };
}

// Полное состояние для админки (конфиг + все активные бонусы — видно, сколько роздано).
export function getAdminState(): DepositBonusState {
  return load();
}
