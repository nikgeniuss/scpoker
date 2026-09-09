// Реферальная программа (ROADMAP §10.21.5) — награда HUB-коинами РАЗОВО по вехе (не пожизненный
// % — проще и безопаснее при бонусной валюте): когда приглашённый наиграл N раздач, оба получают
// credit (реферер больше, приглашённый — welcome-бонус меньше). Привязка кода — только на
// регистрации (auth.ts registerUser), навсегда, задним числом код не применяется.
// Источник правды — server/data/referrals.json (атомарно через writeJSON, §0.4).
import { readJSON, writeJSON } from '../auth/storage.js';
import { hasNetworkCollision, type NetworkInfo } from './antiCollusion.js';
import { aggregateUserStats } from './statsService.js';
import { credit as creditRewardsWallet } from './rewardsWalletService.js';
import { sendNotification } from './inboxService.js';

const FILE = 'referrals.json';
const NETWORK_CAP = 1000;
// Без похожих символов (0/O, 1/I) — как publicId (auth.ts generatePublicId).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export interface ReferralConfig {
  enabled: boolean;
  handsThreshold: number;      // сколько раздач должен наиграть приглашённый для первой выплаты
  referrerReward: number;      // разовый бонус рефереру при выполнении условия
  refereeReward: number;       // разовый welcome-бонус приглашённому
  referrerRakePercent: number; // % от рейка приглашённого рефереру, бессрочно (0 — выключено)
}

interface ReferralLink {
  referrerId: string;
  t: number;
  rewarded: boolean;
  blocked: boolean; // анти-фарм заблокировал выплату (связь сохранена, награды не будет)
  // Доля с рейка копится С МОМЕНТА ПРИВЯЗКИ, но выплачивается только после выполнения условия
  // (решение пользователя 2026-09-07): первая выплата отдаёт всё, что накопилось за период
  // раскрутки, дальше процент капает рефереру сразу с каждой раздачи приглашённого.
  pendingRake: number;     // накоплено до первой выплаты
  totalRakeReward: number; // всего выплачено рефереру с рейка этой связи
}

interface NetworkClaim extends NetworkInfo {
  userId: string;
  t: number;
}

interface ReferralState {
  config: ReferralConfig;
  codes: Record<string, string>;       // userId → свой код
  codeOwners: Record<string, string>;  // код → userId (обратный индекс)
  links: Record<string, ReferralLink>; // newUserId → связь с рефером
  networkClaims: NetworkClaim[];        // анти-фарм: сеть каждого привязанного newUserId
}

function defaults(): ReferralState {
  return {
    config: { enabled: false, handsThreshold: 100, referrerReward: 100, refereeReward: 30, referrerRakePercent: 5 },
    codes: {},
    codeOwners: {},
    links: {},
    networkClaims: [],
  };
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);

function sanitizeConfig(v: unknown, fallback: ReferralConfig): ReferralConfig {
  if (!v || typeof v !== 'object') return fallback;
  const r = v as Partial<ReferralConfig>;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : fallback.enabled,
    handsThreshold: Math.round(num(r.handsThreshold, fallback.handsThreshold)),
    referrerReward: Math.round(num(r.referrerReward, fallback.referrerReward)),
    refereeReward: Math.round(num(r.refereeReward, fallback.refereeReward)),
    referrerRakePercent: Math.max(0, Math.min(100, num(r.referrerRakePercent, fallback.referrerRakePercent))),
  };
}

function sanitizeStringMap(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string') out[k] = val;
  }
  return out;
}

function sanitizeLinks(v: unknown): Record<string, ReferralLink> {
  if (!v || typeof v !== 'object') return {};
  const out: Record<string, ReferralLink> = {};
  for (const [newUserId, raw] of Object.entries(v as Record<string, Partial<ReferralLink>>)) {
    if (!raw || typeof raw.referrerId !== 'string') continue;
    out[newUserId] = {
      referrerId: raw.referrerId,
      t: num(raw.t, Date.now()),
      rewarded: raw.rewarded === true,
      blocked: raw.blocked === true,
      pendingRake: num(raw.pendingRake, 0),       // связи до §10.21.5-percent — с нуля
      totalRakeReward: num(raw.totalRakeReward, 0),
    };
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

function load(): ReferralState {
  try {
    const s = readJSON(FILE) as Partial<ReferralState>;
    const d = defaults();
    return {
      config: sanitizeConfig(s.config, d.config),
      codes: sanitizeStringMap(s.codes),
      codeOwners: sanitizeStringMap(s.codeOwners),
      links: sanitizeLinks(s.links),
      networkClaims: sanitizeNetworkClaims(s.networkClaims),
    };
  } catch {
    return defaults();
  }
}

function save(s: ReferralState): void {
  writeJSON(FILE, s);
}

function generateCode(taken: Set<string>): string {
  let code: string;
  do {
    code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
  } while (taken.has(code));
  return code;
}

// Свой реферальный код — генерируется лениво при первом обращении, дальше стабилен.
export function getOrCreateCode(userId: string): string {
  const s = load();
  if (s.codes[userId]) return s.codes[userId];
  const code = generateCode(new Set(Object.keys(s.codeOwners)));
  s.codes[userId] = code;
  s.codeOwners[code] = userId;
  save(s);
  return code;
}

export function getReferrerIdForCode(code: string): string | null {
  const s = load();
  return s.codeOwners[code.trim().toUpperCase()] ?? null;
}

export function getReferralConfig(): ReferralConfig {
  return load().config;
}

export function updateReferralSettings(patch: Partial<ReferralConfig>): ReferralConfig {
  const s = load();
  s.config = sanitizeConfig({ ...s.config, ...patch }, s.config);
  save(s);
  return s.config;
}

// Привязка кода — только на регистрации, один раз, навсегда (§0.13 — решает сервер, не клиент).
// Анти-фарм (см. вступление к §10.21) — сеть нового аккаунта проверяется и против уже
// привязанных ранее аккаунтов (networkClaims), и против сети самого реферера (self-referral).
// Связь сохраняется в любом случае — заблокирована только ВЫПЛАТА (blocked=true).
export function linkReferral(
  newUserId: string,
  referrerId: string,
  newUserNetwork: NetworkInfo,
  referrerNetwork: NetworkInfo,
): { linked: true; blocked: boolean } | { linked: false; reason: 'self-code' | 'already-linked' } {
  if (referrerId === newUserId) return { linked: false, reason: 'self-code' };
  const s = load();
  if (s.links[newUserId]) return { linked: false, reason: 'already-linked' };

  const priorNetworks: NetworkClaim[] = [...s.networkClaims, { ...referrerNetwork, userId: referrerId, t: 0 }];
  const blocked = hasNetworkCollision(priorNetworks, newUserNetwork);

  s.links[newUserId] = { referrerId, t: Date.now(), rewarded: false, blocked, pendingRake: 0, totalRakeReward: 0 };
  s.networkClaims = [...s.networkClaims, { ...newUserNetwork, userId: newUserId, t: Date.now() }].slice(-NETWORK_CAP);
  save(s);
  return { linked: true, blocked };
}

export interface UserReferralInfo {
  enabled: boolean;
  code: string;
  invitedCount: number;
  rewardedCount: number;
  pendingCount: number;
  handsThreshold: number;
  referrerReward: number;
  refereeReward: number;
  referrerRakePercent: number; // % с рейка приглашённых
  pendingRake: number;         // накоплено по друзьям, ещё не выполнившим условие
  totalRakeReward: number;     // всего получено с рейка приглашённых
}

export function getUserReferralInfo(userId: string): UserReferralInfo {
  const code = getOrCreateCode(userId);
  const s = load();
  const invited = Object.values(s.links).filter((l) => l.referrerId === userId);
  return {
    enabled: s.config.enabled,
    code,
    invitedCount: invited.length,
    rewardedCount: invited.filter((l) => l.rewarded).length,
    pendingCount: invited.filter((l) => !l.rewarded && !l.blocked).length,
    handsThreshold: s.config.handsThreshold,
    referrerReward: s.config.referrerReward,
    refereeReward: s.config.refereeReward,
    referrerRakePercent: s.config.referrerRakePercent,
    pendingRake: invited.reduce((sum, l) => sum + (l.blocked ? 0 : l.pendingRake), 0),
    totalRakeReward: invited.reduce((sum, l) => sum + l.totalRakeReward, 0),
  };
}

// Доля реферера с одной раздачи приглашённого. Вызывается из GameManager.cleanupHand рядом с
// рейкбэком — на том же уже посчитанном персональном рейке игрока.
// До выполнения условия (handsThreshold) сумма КОПИТСЯ в связи, после — начисляется сразу.
// Возвращает начисленную сейчас сумму (0 — скопилось или не положено).
export function accrueFromRake(refereeUserId: string, rakeCents: number): number {
  if (rakeCents <= 0) return 0;
  const s = load();
  if (!s.config.enabled || s.config.referrerRakePercent <= 0) return 0;
  const link = s.links[refereeUserId];
  if (!link || link.blocked) return 0;

  const amount = Math.floor((rakeCents * s.config.referrerRakePercent) / 100);
  if (amount <= 0) return 0;

  if (link.rewarded) {
    creditRewardsWallet(link.referrerId, amount, 'referral');
    link.totalRakeReward += amount;
    save(s);
    return amount;
  }

  link.pendingRake += amount; // условие ещё не выполнено — копим, выплатим одной суммой
  save(s);
  return 0;
}

export interface MilestoneResult {
  newUserId: string;
  referrerId: string;
  referrerReward: number;
  refereeReward: number;
}

// Батч-проверка всех непогашенных незаблокированных связей — сколько раздач сыграл приглашённый
// (statsService, уже готовая lifetime-агрегация). Вызывается периодически из index.ts (см. start()).
export function processMilestoneTick(): MilestoneResult[] {
  const s = load();
  if (!s.config.enabled) return [];
  const results: MilestoneResult[] = [];

  for (const [newUserId, link] of Object.entries(s.links)) {
    if (link.rewarded || link.blocked) continue;
    const hands = aggregateUserStats(newUserId, null, null).hands;
    if (hands < s.config.handsThreshold) continue;

    // Первая выплата = разовый бонус + ВСЁ, что накопилось процентом с рейка за период раскрутки.
    const accrued = link.pendingRake;
    const referrerTotal = s.config.referrerReward + accrued;
    creditRewardsWallet(link.referrerId, referrerTotal, 'referral');
    creditRewardsWallet(newUserId, s.config.refereeReward, 'referral');
    const accruedNote = accrued > 0 ? ` (в т.ч. ${accrued} с рейка друга)` : '';
    sendNotification(link.referrerId, 'reward', `Приглашённый друг сыграл ${s.config.handsThreshold} раздач: +${referrerTotal} HUB${accruedNote}`);
    sendNotification(newUserId, 'reward', `Приветственный бонус: +${s.config.refereeReward} HUB`);

    link.rewarded = true;
    link.totalRakeReward += accrued;
    link.pendingRake = 0;
    results.push({ newUserId, referrerId: link.referrerId, referrerReward: referrerTotal, refereeReward: s.config.refereeReward });
  }

  if (results.length) save(s);
  return results;
}

let timer: ReturnType<typeof setInterval> | null = null;

export function start(intervalMs: number): void {
  stop();
  timer = setInterval(() => {
    try {
      processMilestoneTick();
    } catch (err) {
      console.error('⚠️ [referral] processMilestoneTick тик упал:', err);
    }
  }, intervalMs);
}

export function stop(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
