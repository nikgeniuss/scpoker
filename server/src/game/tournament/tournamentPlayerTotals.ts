import type { TournamentInfo } from '@poker-room/shared';
import { readJSON, writeJSON } from '../../auth/storage.js';

// Персональные турнирные итоги игрока за всё время: вложено/получено (ROI в профиле, ROADMAP §9.1)
// и сколько турниров сыграно/выиграно (прогресс достижений, §10.21.3).
// Почему не считать on-read по tournamentManager.list(): завершённый турнир удаляется из списка
// через 30 минут (scheduleAutoRemove), и любая метрика по нему молча откатывается — ROI к
// прочерку, прогресс достижения к «0/10» (игрок мог не успеть забрать заработанную награду).
// Поэтому итоги копятся при finish(), как журнал экономики (tournamentLedger), только в разрезе
// игроков. Источник правды — server/data/tournament-player-totals.json (атомарно, §0.3).
const FILE = 'tournament-player-totals.json';
// Id последних учтённых турниров — защита от повторного учёта. Турнир после finish() живёт ещё
// 30 минут и потом удаляется, повторить finish старее последних 500 нечем.
const RECORDED_CAP = 500;

// Одна запись входа игрока в турнир + параметры турнира, нужные для цены входа.
export interface TournamentEntryInput {
  tournamentId: string;
  userId: string;
  buyIn: number;
  reEntryFee?: number;  // цена ре-энтри, если отличается от buyIn
  promoCode?: string;   // вход оплачен промокодом — банкролл не списывался, цена входа 0
  prize?: number;       // выплата за призовое место
  bountyWon?: number;   // собранные баунти за чужие головы
  finishPlace?: number; // окончательное место (1 = победа)
}

export interface UserTournamentTotals {
  spent: number;       // вложено фишек за входы
  returned: number;    // получено (призы + баунти)
  tournaments: number; // сыграно турниров (ре-энтри не считается вторым турниром)
  wins: number;        // побед (finishPlace === 1)
}

export interface UserRoi {
  spent: number;
  returned: number;
  roiPercent: number | null; // (returned - spent) / spent * 100; null — вложений не было
}

export interface TournamentTotalsState {
  users: Record<string, UserTournamentTotals>;
  recorded: string[]; // id уже учтённых турниров (свежие в начале)
}

function empty(): UserTournamentTotals {
  return { spent: 0, returned: 0, tournaments: 0, wins: 0 };
}

// === Чистая часть ===

// Итоги по каждому игроку из entries турнира. Цена входа: первая запись игрока в турнире — buyIn,
// последующие (ре-энтри) — reEntryFee ?? buyIn; вход по промокоду — 0 (см. redeemPromoCode:
// банкролл не списывается, за игрока платит рум). Турнир засчитывается один раз на игрока,
// сколько бы ре-энтри он ни сделал.
export function computeTotalsByUser(entries: TournamentEntryInput[]): Record<string, UserTournamentTotals> {
  const out: Record<string, UserTournamentTotals> = {};
  const seen = new Set<string>();
  for (const e of entries) {
    const key = e.tournamentId + '/' + e.userId;
    const isReEntry = seen.has(key);
    seen.add(key);
    const acc = out[e.userId] ?? (out[e.userId] = empty());
    if (!isReEntry) acc.tournaments++;
    if (!e.promoCode) acc.spent += isReEntry ? (e.reEntryFee ?? e.buyIn) : e.buyIn;
    acc.returned += (e.prize ?? 0) + (e.bountyWon ?? 0);
    if (e.finishPlace === 1) acc.wins++;
  }
  return out;
}

// Итоги → ROI с процентом. Вложений не было (не играл / только промокоды) — процента нет.
export function toRoi(totals: Pick<UserTournamentTotals, 'spent' | 'returned'> | undefined): UserRoi {
  const t = totals ?? { spent: 0, returned: 0 };
  return {
    spent: t.spent,
    returned: t.returned,
    roiPercent: t.spent > 0 ? ((t.returned - t.spent) / t.spent) * 100 : null,
  };
}

// Учесть завершённый турнир. Идемпотентно по tournamentId — повторный вызов ничего не добавит.
export function applyTournamentTotals(
  state: TournamentTotalsState,
  tournamentId: string,
  entries: TournamentEntryInput[],
): TournamentTotalsState {
  if (state.recorded.includes(tournamentId)) return state;
  const users: Record<string, UserTournamentTotals> = { ...state.users };
  for (const [userId, add] of Object.entries(computeTotalsByUser(entries))) {
    const prev = users[userId] ?? empty();
    users[userId] = {
      spent: prev.spent + add.spent,
      returned: prev.returned + add.returned,
      tournaments: prev.tournaments + add.tournaments,
      wins: prev.wins + add.wins,
    };
  }
  return { users, recorded: [tournamentId, ...state.recorded].slice(0, RECORDED_CAP) };
}

// === Файловые обёртки ===

function load(): TournamentTotalsState {
  try {
    const raw = readJSON(FILE) as Partial<TournamentTotalsState>;
    return {
      users: raw && typeof raw.users === 'object' && raw.users ? raw.users : {},
      recorded: Array.isArray(raw?.recorded) ? raw.recorded : [],
    };
  } catch {
    return { users: {}, recorded: [] }; // файла нет или повреждён — итоги начинаются заново
  }
}

// Вызывается из TournamentManager.finish рядом с журналом экономики: там entries уже финальные
// (места присвоены через computeFinalPlaces, призы и баунти проставлены).
export function recordTournamentTotals(info: TournamentInfo): void {
  const entries: TournamentEntryInput[] = info.entries.map(e => ({
    tournamentId: info.id,
    userId: e.userId,
    buyIn: info.buyIn,
    reEntryFee: info.reEntryFee,
    promoCode: e.promoCode,
    prize: e.prize,
    bountyWon: e.bountyWon,
    finishPlace: e.finishPlace,
  }));
  writeJSON(FILE, applyTournamentTotals(load(), info.id, entries));
}

export function getUserTotals(userId: string): UserTournamentTotals {
  return load().users[userId] ?? empty();
}
