import type { TournamentInfo } from '@poker-room/shared';
import { readJSON, writeJSON } from '../../auth/storage.js';

// Журнал турнирной экономики: по одной строке на завершённый турнир — сколько собрано за входы,
// сколько ушло руму рейком, сколько доплачено оверлеем и сколько роздано призами.
// Зачем отдельный файл: overlay — это ЭМИССИЯ фишек (при финише prizePool просто увеличивается,
// ниоткуда не списываясь), а единственный её след — поле overlayPaid внутри самого турнира,
// которое исчезает вместе с турниром при уборке из лобби (живой прогон 2026-09-02: две записи
// по 10000 растворились). Журнал переживает уборку и даёт сквозную картину доход/расход.
// Источник правды — server/data/tournament-ledger.json (атомарно через writeJSON, §0.3).
const FILE = 'tournament-ledger.json';
const CAP = 500;

export interface TournamentLedgerEntry {
  tournamentId: string;
  name: string;
  type: 'sng' | 'mtt';
  finishedAt: number;
  entries: number;          // входов всего (ре-энтри считается отдельным входом)
  uniquePlayers: number;    // уникальных участников
  collectedFees: number;    // собрано за входы (бай-ины + ре-энтри)
  rake: number;             // из них удержано руму
  bounty: number;           // из них ушло в баунти-фонд (выплачивается за головы по ходу турнира)
  overlay: number;          // доплачено румом до гарантии — ЭМИССИЯ, расход
  prizePool: number;        // итоговый призовой (с оверлеем)
  paidOut: number;          // фактически выплачено призовых мест
  net: number;              // rake - overlay: плюс = турнир принёс, минус = стоил руму
}

function load(): TournamentLedgerEntry[] {
  try {
    const raw = readJSON(FILE);
    return Array.isArray(raw) ? (raw as TournamentLedgerEntry[]) : [];
  } catch {
    return []; // файла нет или повреждён — журнал начинается заново, турниры от этого не страдают
  }
}

// Строит запись журнала по завершённому турниру. Чистая функция — тестируется изолированно.
export function buildLedgerEntry(info: TournamentInfo, finishedAt: number): TournamentLedgerEntry {
  const collectedFees = info.collectedFees ?? 0;
  const rake = info.collectedRake ?? 0;
  const overlay = info.overlayPaid ?? 0;
  const paidOut = info.entries.reduce((sum, e) => sum + (e.prize ?? 0), 0);
  return {
    tournamentId: info.id,
    name: info.name,
    type: info.type,
    finishedAt,
    entries: info.entries.length,
    uniquePlayers: new Set(info.entries.map(e => e.userId)).size,
    collectedFees,
    rake,
    bounty: info.collectedBounty ?? 0,
    overlay,
    prizePool: info.prizePool,
    paidOut,
    net: rake - overlay,
  };
}

// Дописать турнир в журнал. Идемпотентно по tournamentId — повторный finish (если такое случится)
// не задваивает строку.
export function recordTournamentFinish(info: TournamentInfo, finishedAt: number): void {
  const log = load().filter(e => e.tournamentId !== info.id);
  log.unshift(buildLedgerEntry(info, finishedAt));
  writeJSON(FILE, log.slice(0, CAP));
}

export function getTournamentLedger(): TournamentLedgerEntry[] {
  return load();
}

// Итоги по журналу — для сводки в админке.
export function summarizeLedger(log: TournamentLedgerEntry[]): {
  tournaments: number; collectedFees: number; rake: number; overlay: number; paidOut: number; net: number;
} {
  return log.reduce(
    (acc, e) => ({
      tournaments: acc.tournaments + 1,
      collectedFees: acc.collectedFees + e.collectedFees,
      rake: acc.rake + e.rake,
      overlay: acc.overlay + e.overlay,
      paidOut: acc.paidOut + e.paidOut,
      net: acc.net + e.net,
    }),
    { tournaments: 0, collectedFees: 0, rake: 0, overlay: 0, paidOut: 0, net: 0 },
  );
}
