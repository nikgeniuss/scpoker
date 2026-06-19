import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager, seatPlayer, type GameManagerLike } from './helpers/gameManager.js';
import { setStorage } from './helpers/storage.js';
import { getBadBeatState } from '../badBeatService.js';
import { card, buildDeck } from './helpers/cards.js';

// Интеграционные тесты Bad Beat Jackpot — врезка в GameManager.showdown (Фазы 2+3).
// Чистые функции (детект/дроп/выплата) уже покрыты badBeatDetect/badBeatDrop.test.ts;
// здесь проверяем всю цепочку на реальной раздаче: гейт стола → дроп в пул → детект → выплата
// в стеки → уменьшение пула → запись в hits. Это снимает пометку «не проверено вживую».
//
// Колода ригуется через startGame(roomId, deck); порядок раздачи — sequential (P0 обе карты,
// P1 обе, …), затем 1 burn + улицы (см. helpers/cards.ts buildDeck).

const SEED = 100_000; // стартовый пул джекпота (центы)
const SB = 5;
const BB = 10;

type StateView = {
  phase: string;
  players: Array<{ id: string; chips: number }>;
  pot: number;
};

function chipsOf(gm: GameManagerLike, roomId: string, userId: string): number {
  const s = gm.getGameState(roomId) as unknown as StateView;
  return s.players.find((p) => p.id === userId)!.chips;
}

// Засеять состояние джекпота: включён, пул заряжен, дроп по ББ-тиру, триггер NLH = aaajj (дефолт).
// tiers не указываем — load() подставит DEFAULT_TIERS (тир[0] для BB=10 центов).
function seedBadBeat(enabled: boolean): void {
  setStorage('badbeat.json', {
    enabled,
    pool: SEED,
    dropMode: 'bb',
    percent: 0.15,
    triggers: { nlh: 'aaajj', short: 'aaaa' },
    topups: [],
    hits: [],
  });
}

// Публичный стол на 4 игрока (без пароля, не бот-стол) — проходит гейт.
async function setupTable() {
  const { gm, io } = await createTestGameManager();
  const create = gm.createRoom(
    {
      name: 'BadBeatRoom',
      smallBlind: SB,
      bigBlind: BB,
      maxPlayers: 9,
      turnDurationSec: 30,
      buyInMinBb: 5,
      buyInMaxBb: 100,
    },
    'system',
  );
  if ('error' in create) throw new Error(create.error);
  const roomId = create.roomId;
  for (const id of ['A', 'B', 'C', 'D']) {
    seatPlayer(gm, io, { roomId, userId: id, username: id + '-name', bankroll: 10_000, buyIn: 1000 });
  }
  return { gm, io, roomId };
}

// Колода под бэд-бит: проигравший A = тузы-фулл-вальты (ровно порог aaajj), победитель B = каре вальтов.
// Борд: A♠ J♦ J♣ 7♠ 2♥. Оба используют ОБЕ карманные. C/D — мусор (одна пара с борда, ниже порога).
// Раздача 4-max: P0=A, P1=B, P2=C, P3=D.
function badBeatDeck() {
  return buildDeck(
    card('A', 'd'), card('A', 'c'), // A hole (loser: AA)
    card('J', 'h'), card('J', 's'), // B hole (winner: JJ)
    card('3', 'c'), card('4', 'd'), // C hole (мусор)
    card('6', 'c'), card('8', 'd'), // D hole (мусор)
    card('2', 'c'),                 // burn
    card('A', 's'), card('J', 'd'), card('J', 'c'), // flop
    card('3', 'd'),                 // burn
    card('7', 's'),                 // turn
    card('4', 'c'),                 // burn
    card('2', 'h'),                 // river
  );
}

describe('GameManager — Bad Beat Jackpot (showdown-врезка, Фазы 2+3)', () => {
  beforeEach(() => {
    resetStorage();
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('бэд-бит срабатывает: дроп в пул, детект, выплата в стеки, запись в hits', async () => {
    seedBadBeat(true);
    const { gm, roomId } = await setupTable();
    gm.startGame(roomId, badBeatDeck());

    // 4-max первая раздача: D=B(1), SB=C(2), BB=D(3), UTG=A(0).
    // Префлоп: A рейзит до 30, все коллируют → банк 120 (≥ 10×BB=100, гейт пройден).
    gm.handlePlayerAction(roomId, 'A', 'raise', 30);
    gm.handlePlayerAction(roomId, 'B', 'call');
    gm.handlePlayerAction(roomId, 'C', 'call');
    gm.handlePlayerAction(roomId, 'D', 'call');
    // Постфлоп первый — SB=C, порядок C→D→A→B. Все чек до шоудауна.
    for (const _street of ['flop', 'turn', 'river']) {
      gm.handlePlayerAction(roomId, 'C', 'check');
      gm.handlePlayerAction(roomId, 'D', 'check');
      gm.handlePlayerAction(roomId, 'A', 'check');
      gm.handlePlayerAction(roomId, 'B', 'check');
    }

    const state = getBadBeatState();
    const t0 = state.tiers[0];
    const drop = Math.floor(t0.bb * BB);          // дроп с пост-рейкового банка (рейк=0)
    const poolAtPayout = SEED + drop;             // выплата считается из пула ПОСЛЕ дропа
    const winA = Math.floor((poolAtPayout * t0.win) / 100); // проигравший монстр-рукой
    const oppB = Math.floor((poolAtPayout * t0.opp) / 100); // забравший банк
    const oth = Math.floor((poolAtPayout * t0.oth) / 100);  // прочие, каждому
    const total = winA + oppB + oth * 2;

    // Детект сработал и записан.
    expect(state.hits).toHaveLength(1);
    expect(state.hits[0].loser).toBe('A');
    expect(state.hits[0].opponent).toBe('B');
    expect(state.hits[0].total).toBe(total);

    // Пул: вырос на дроп, упал на выплату.
    expect(state.pool).toBe(poolAtPayout - total);

    // Выплата зачислена в стеки. A проиграл весь вложенный банк (970 после взноса 30),
    // но получил джекпот-долю — доказательство начисления даже проигравшему.
    const base = 1000 - 30;
    expect(chipsOf(gm, roomId, 'A')).toBe(base + winA);
    expect(chipsOf(gm, roomId, 'B')).toBe(base + (120 - drop) + oppB); // B ещё забрал банк (минус дроп)
    expect(chipsOf(gm, roomId, 'C')).toBe(base + oth);
    expect(chipsOf(gm, roomId, 'D')).toBe(base + oth);
  });

  it('гейт ≥10×BB: тот же бэд-бит, но малый банк → ни дропа, ни выплаты', async () => {
    seedBadBeat(true);
    const { gm, roomId } = await setupTable();
    gm.startGame(roomId, badBeatDeck());

    // Лимп-раздача: банк остаётся 40 (< 10×BB=100) → bbActive=false.
    gm.handlePlayerAction(roomId, 'A', 'call');  // UTG лимп до BB
    gm.handlePlayerAction(roomId, 'B', 'call');
    gm.handlePlayerAction(roomId, 'C', 'call');
    gm.handlePlayerAction(roomId, 'D', 'check'); // BB-опция закрывает префлоп
    for (const _street of ['flop', 'turn', 'river']) {
      gm.handlePlayerAction(roomId, 'C', 'check');
      gm.handlePlayerAction(roomId, 'D', 'check');
      gm.handlePlayerAction(roomId, 'A', 'check');
      gm.handlePlayerAction(roomId, 'B', 'check');
    }

    const state = getBadBeatState();
    // Джекпот не тронут: нет срабатываний, пул без изменений (дроп не отчислялся).
    expect(state.hits).toHaveLength(0);
    expect(state.pool).toBe(SEED);
  });

  it('джекпот выключен: дроп/детект не выполняются даже на квалифицирующем банке', async () => {
    seedBadBeat(false); // enabled=false
    const { gm, roomId } = await setupTable();
    gm.startGame(roomId, badBeatDeck());

    gm.handlePlayerAction(roomId, 'A', 'raise', 30);
    gm.handlePlayerAction(roomId, 'B', 'call');
    gm.handlePlayerAction(roomId, 'C', 'call');
    gm.handlePlayerAction(roomId, 'D', 'call');
    for (const _street of ['flop', 'turn', 'river']) {
      gm.handlePlayerAction(roomId, 'C', 'check');
      gm.handlePlayerAction(roomId, 'D', 'check');
      gm.handlePlayerAction(roomId, 'A', 'check');
      gm.handlePlayerAction(roomId, 'B', 'check');
    }

    const state = getBadBeatState();
    expect(state.hits).toHaveLength(0);
    expect(state.pool).toBe(SEED);
  });
});
