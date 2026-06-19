// История раздач (ROADMAP §10.10 «PokerCraft-lite»). Снимок завершённой раздачи для
// детального просмотра игроком. Запись идёт из GameManager.endGame через инжектируемый
// колбэк (handRecorder) — тесты его не выставляют, поэтому файл при прогоне не пишется.
// Хранилище — последние CAP раздач в hands-detailed.json (атомарно через writeJSON, §0.4;
// data/ не watch'ится nodemon'ом, §0.3).
//
// §0.1 (приватность карт): храним карманные ВСЕХ игроков, но при выдаче клиенту отдаём чужие
// только если игрок показал их на showdown (revealed). Свои — всегда. Сериализация — в
// getHandsForUser, эндпоинт никогда не отдаёт скрытые карманные.
import { readJSON, writeJSON } from '../auth/storage.js';
import { randomUUID } from 'crypto';
import type { Card } from './types.js';

const FILE = 'hands-detailed.json';
const CAP = 500; // ротация: храним последние N раздач

// Одно действие в раздаче (для пошагового replay). Карт не содержит — приватность не затрагивает.
export interface HandAction {
  phase: string; // preflop/flop/turn/river
  playerId: string;
  type: string; // 'ante' | 'sb' | 'bb' | 'fold' | 'check' | 'call' | 'raise' | 'all-in'
  amount?: number; // call=добор, raise=raise-to, all-in=итоговая ставка, blind/ante=сумма
}

export interface HandHistoryPlayer {
  id: string;
  username: string;
  displayName?: string;
  cards: Card[]; // карманные (приватность — при выдаче)
  folded: boolean;
  revealed: boolean; // показал карты на showdown
  net: number; // изменение стека за раздачу
}

export interface HandHistoryRecord {
  id: string;
  t: number; // epoch ms завершения
  roomId: string;
  roomName: string;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  board: Card[];
  pot: number;
  rake: number;
  winners: string[];
  winAmounts: Record<string, number>;
  handName?: string;
  players: HandHistoryPlayer[];
  actions: HandAction[]; // последовательность ходов для пошагового replay
  format?: 'nlh' | 'shortdeck'; // формат стола; отсутствие = nlh (старые записи)
}

function readLog(): HandHistoryRecord[] {
  try {
    const log = readJSON(FILE) as HandHistoryRecord[];
    return Array.isArray(log) ? log : [];
  } catch {
    return []; // файла ещё нет или повреждён
  }
}

// Записать снимок раздачи (id присваивается здесь). Синхронно — как recordHandStat,
// чтобы read-modify-write не чередовался между одновременно завершающимися столами.
export function recordHand(rec: Omit<HandHistoryRecord, 'id'>): void {
  const log = readLog();
  log.push({ id: randomUUID(), ...rec });
  const trimmed = log.length > CAP ? log.slice(log.length - CAP) : log;
  writeJSON(FILE, trimmed);
}

// HUD-статистика игрока: VPIP и PFR из последних limit раздач по actions-лог.
// VPIP = voluntarily put in pot (call/raise/all-in на префлопе, исключая blind-check).
// PFR  = pre-flop raiser (raise/all-in на префлопе).
// Чистая функция (тестируется без файловой системы).
export function computeHudStats(
  hands: HandHistoryRecord[],
  userId: string,
): { vpip: number; pfr: number; hands: number } {
  let handsCount = 0, vpipCount = 0, pfrCount = 0;
  for (const hand of hands) {
    if (!hand.players.some(p => p.id === userId)) continue;
    handsCount++;
    const pf = hand.actions.filter(a => a.phase === 'preflop' && a.playerId === userId);
    if (pf.some(a => a.type === 'raise' || a.type === 'all-in')) { vpipCount++; pfrCount++; }
    else if (pf.some(a => a.type === 'call')) vpipCount++;
  }
  if (handsCount === 0) return { vpip: 0, pfr: 0, hands: 0 };
  return { vpip: Math.round(vpipCount / handsCount * 100), pfr: Math.round(pfrCount / handsCount * 100), hands: handsCount };
}

export function getHudStats(userId: string, limit = 200): { vpip: number; pfr: number; hands: number } {
  const log = readLog();
  return computeHudStats(log.filter(h => h.players.some(p => p.id === userId)).slice(-limit), userId);
}

// Публичная сводка победителей последних раздач стола (ROADMAP §10.4 «История победителей»).
// Без карманных карт — только кто выиграл/сколько/комбинация (если было реальное вскрытие).
// Видно любому игроку (как RoomInfo), приватность §0.1 не затрагивается.
export interface RoomWinnersEntry {
  t: number;
  winners: { id: string; username: string; amount: number }[];
  handName?: string;
}

export function getRecentWinnersForRoom(roomId: string, limit = 10): RoomWinnersEntry[] {
  const log = readLog();
  const mine = log.filter((h) => h.roomId === roomId);
  const recent = mine.slice(Math.max(0, mine.length - limit)).reverse();
  return recent.map((h) => ({
    t: h.t,
    winners: h.winners.map((id) => ({
      id,
      username: h.players.find((p) => p.id === id)?.username ?? '?',
      amount: h.winAmounts[id] ?? 0,
    })),
    handName: h.handName,
  }));
}

// Последние limit раздач, где участвовал userId. Новые — сверху.
// revealAll=true (только для админа, §0.12) — отдаём все карманные без редакции; иначе §0.1.
export function getHandsForUser(userId: string, limit: number, revealAll = false): HandHistoryRecord[] {
  const log = readLog();
  const mine = log.filter((h) => h.players.some((p) => p.id === userId));
  const recent = mine.slice(Math.max(0, mine.length - limit)).reverse();
  if (revealAll) return recent;
  return recent.map((h) => ({
    ...h,
    players: h.players.map((p) => ({
      ...p,
      // §0.1: чужие карманные — только если показаны на showdown.
      cards: p.id === userId || p.revealed ? p.cards : [],
    })),
  }));
}
