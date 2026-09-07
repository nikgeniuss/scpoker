import { describe, it, expect } from 'vitest';
import { serializeGameState, activeTableModes } from '../gameStateSerializer.js';
import { cards } from './helpers/cards.js';

// §0.1 — карты соперников НЕ должны уходить клиенту до showdown. Изолированный тест чистого
// сериализатора (была реальная утечка через DevTools, фикс 2026-05-17).

function makeRoom(opts?: { phase?: string; tbEnabled?: boolean }) {
  const mkPlayer = (id: string, name: string, hole: string, pos: number) => ({
    id, username: name, chips: 1000, cards: cards(hole),
    isActive: true, isFolded: false, currentBet: 0, position: pos, avatar: '',
    disconnected: false, timebank: 30,
  });
  const players = new Map([
    ['A', mkPlayer('A', 'Alice', 'As Ad', 0)],
    ['B', mkPlayer('B', 'Bob', 'Ks Kd', 1)],
  ]);
  return {
    id: 'room1', name: 'T', players,
    communityCards: [], deck: cards('2c 3c 4c 5c 6c 7c 8c 9c 10c'),
    pot: 0, currentBet: 0, dealerIndex: 0, currentPlayerIndex: 0,
    phase: opts?.phase ?? 'preflop',
    turnEndsAt: null, turnDurationMs: 30000, turnTimebankEndsAt: null, turnTimebankStartedAt: null,
    smallBlind: 5, bigBlind: 10,
    timebank: { enabled: opts?.tbEnabled ?? true, startSec: 30, bonusSec: 10, bonusEveryHands: 10, capSec: 60 },
    rake: { percent: 5, capBb: 3 },
  } as unknown as Parameters<typeof serializeGameState>[0];
}

const cardsOf = (s: ReturnType<typeof serializeGameState>, id: string) =>
  s.players.find((p) => p.id === id)!.cards;

describe('serializeGameState — защита карт (§0.1)', () => {
  it('без viewerId вне showdown → карт нет НИ У КОГО', () => {
    const s = serializeGameState(makeRoom());
    expect(cardsOf(s, 'A')).toEqual([]);
    expect(cardsOf(s, 'B')).toEqual([]);
  });

  it('viewerId=A → A видит свои карты, B — пустые', () => {
    const s = serializeGameState(makeRoom(), 'A');
    expect(cardsOf(s, 'A')).toHaveLength(2);
    expect(cardsOf(s, 'B')).toEqual([]); // карты соперника НЕ уходят
  });

  it('showdown → карты раскрываются дошедшим до вскрытия', () => {
    const s = serializeGameState(makeRoom({ phase: 'showdown' }));
    expect(cardsOf(s, 'A')).toHaveLength(2);
    expect(cardsOf(s, 'B')).toHaveLength(2);
  });

  it('showdown с ≥2 дошедшими → карты сфолдившего скрыты, у дошедших видны (§0.1)', () => {
    const room = makeRoom({ phase: 'showdown' });
    const players = (room as unknown as { players: Map<string, Record<string, unknown>> }).players;
    // Добавляем C, который сфолдил — A и B боролись за банк (контест), C мак'нул.
    players.set('C', {
      id: 'C', username: 'Carol', chips: 1000, cards: cards('2d 7h'),
      isActive: true, isFolded: true, currentBet: 0, position: 2, avatar: '',
      disconnected: false, timebank: 30,
    });
    const s = serializeGameState(room); // общий showdown-стейт (без viewer)
    expect(cardsOf(s, 'A')).toHaveLength(2); // дошёл — раскрыт
    expect(cardsOf(s, 'B')).toHaveLength(2); // дошёл — раскрыт
    expect(cardsOf(s, 'C')).toEqual([]); // сфолдил — скрыт от соперников
    const sC = serializeGameState(room, 'C'); // сам C видит свои карты
    expect(cardsOf(sC, 'C')).toHaveLength(2);
  });

  it('выигрыш без вскрытия (остался один не сфолдивший) → карты НЕ раскрываются', () => {
    const room = makeRoom({ phase: 'showdown' });
    const players = (room as unknown as { players: Map<string, { isFolded: boolean }> }).players;
    players.get('B')!.isFolded = true; // остался один A — банк не вскрывался
    const s = serializeGameState(room);
    expect(cardsOf(s, 'A')).toEqual([]); // победитель без вскрытия — карты скрыты
    expect(cardsOf(s, 'B')).toEqual([]);
  });

  // Выигрыш «все сфолдили» бывает на любой улице — правило одно: раскрытия нет, потому что
  // считается ЧИСЛО не сфолдивших, а не количество карт на борде (вопрос из живого прогона).
  it.each([
    ['преflop', ''],
    ['флоп', '2h 7d 9c'],
    ['тёрн', '2h 7d 9c Jh'],
    ['ривер', '2h 7d 9c Jh 4s'],
  ])('выигрыш без вскрытия на улице «%s» → карты победителя скрыты от соперников', (_street, board) => {
    const room = makeRoom({ phase: 'showdown' });
    const r = room as unknown as { players: Map<string, { isFolded: boolean }>; communityCards: unknown[] };
    r.communityCards = board ? cards(board) : [];
    r.players.get('B')!.isFolded = true; // все, кроме A, сфолдили

    const s = serializeGameState(room); // взгляд со стороны стола
    expect(cardsOf(s, 'A')).toEqual([]);
    expect(cardsOf(s, 'B')).toEqual([]);
    // Сфолдивший соперник тоже не должен увидеть руку победителя.
    expect(cardsOf(serializeGameState(room, 'B'), 'A')).toEqual([]);
    // Сам победитель свои карты видит всегда.
    expect(cardsOf(serializeGameState(room, 'A'), 'A')).toHaveLength(2);
  });

  it('выигрыш без вскрытия → имя комбинации победителя тоже не утекает (handHint)', () => {
    const room = makeRoom({ phase: 'showdown' });
    const r = room as unknown as { players: Map<string, { isFolded: boolean; wantsHint?: boolean }> };
    r.players.get('B')!.isFolded = true;
    r.players.get('B')!.wantsHint = true; // сфолдивший включил подсказку комбинаций

    const s = serializeGameState(room, 'B');
    expect(s.players.find((p) => p.id === 'A')!.handHint).toBeUndefined();
  });

  it('withPeek → карты всех + futureBoard присутствует', () => {
    const s = serializeGameState(makeRoom(), undefined, true);
    expect(cardsOf(s, 'A')).toHaveLength(2);
    expect(cardsOf(s, 'B')).toHaveLength(2);
    expect(Array.isArray(s.futureBoard)).toBe(true);
  });

  it('без peek → futureBoard undefined', () => {
    const s = serializeGameState(makeRoom(), 'A');
    expect(s.futureBoard).toBeUndefined();
  });

  it('timebank выключен → player.timebank undefined', () => {
    const s = serializeGameState(makeRoom({ tbEnabled: false }), 'A');
    expect(s.players[0].timebank).toBeUndefined();
    expect(s.timebankEnabled).toBe(false);
  });

  it('winners всегда null (заполняется отдельным событием GAME_WINNER)', () => {
    expect(serializeGameState(makeRoom()).winners).toBeNull();
  });

  it('rake пробрасывается из room (для показа в TableInfoModal)', () => {
    expect(serializeGameState(makeRoom()).rake).toEqual({ percent: 5, capBb: 3 });
  });

  it('добровольно показанная карта видна всем (shownCards), непоказанная — null', () => {
    const room = makeRoom();
    const players = (room as unknown as { players: Map<string, { revealedCards?: number[] }> }).players;
    players.get('A')!.revealedCards = [0]; // A показал только первую карту
    const s = serializeGameState(room); // без viewer
    const a = s.players.find((p) => p.id === 'A')!;
    expect(a.cards).toEqual([]); // полные карты по-прежнему скрыты
    expect(a.shownCards).toHaveLength(2);
    expect(a.shownCards![0]).not.toBeNull(); // показанная — видна
    expect(a.shownCards![1]).toBeNull(); // непоказанная — НЕ утекла
  });

  it('у владельца (свои карты видны) shownCards не дублируется', () => {
    const room = makeRoom();
    (room as unknown as { players: Map<string, { revealedCards?: number[] }> }).players.get('A')!.revealedCards = [0];
    const s = serializeGameState(room, 'A'); // A видит свои карты полностью
    const a = s.players.find((p) => p.id === 'A')!;
    expect(a.cards).toHaveLength(2);
    expect(a.shownCards).toBeUndefined();
  });
});

// willWin — детерминированный сигнал «выиграю ли я» для админа на своём месте (admin-peek).
// Отдельная колода, подобранная так, чтобы известный itog-борд (finalBoard = futureBoard, т.к.
// communityCards пуст) был предсказуем: preflop-паттерн getFutureBoardCards читает с вершины
// колоды burn→flop×3→burn→turn→burn→river, т.е. при deck длины 8 индексы [7,3,1] сгорают,
// а finalBoard = [deck[6], deck[5], deck[4], deck[2], deck[0]].
describe('serializeGameState — willWin (§0.1, только admin-peek на своём месте)', () => {
  // index0 = burn(river), index2 = turn, index4/5/6 = flop3/flop2/flop1, index1/3/7 = burn(нейтральные).
  // Дефолтная колода → итоговый борд 2h 5d 9c Ks 3s (рэйнбоу, но содержит Ks — даёт Bob трипс
  // с карманными Kd Kc). Для чистого сравнения пар (без трипса у Bob) тест передаёт колоду без короля.
  const DEFAULT_DECK = '3s Th Ks Jd 9c 5d 2h Qc';

  function makeWillWinRoom(aHole: string, bHole: string, deckStr: string = DEFAULT_DECK) {
    const mkPlayer = (id: string, name: string, hole: string, pos: number, folded = false) => ({
      id, username: name, chips: 1000, cards: cards(hole),
      isActive: true, isFolded: folded, currentBet: 0, position: pos, avatar: '',
      disconnected: false, timebank: 30,
    });
    const players = new Map([
      ['A', mkPlayer('A', 'Alice', aHole, 0)],
      ['B', mkPlayer('B', 'Bob', bHole, 1)],
    ]);
    const deck = cards(deckStr);
    return {
      id: 'room1', name: 'T', players,
      communityCards: [], deck,
      pot: 0, currentBet: 0, dealerIndex: 0, currentPlayerIndex: 0,
      phase: 'preflop',
      turnEndsAt: null, turnDurationMs: 30000, turnTimebankEndsAt: null, turnTimebankStartedAt: null,
      smallBlind: 5, bigBlind: 10,
      timebank: { enabled: true, startSec: 30, bonusSec: 10, bonusEveryHands: 10, capSec: 60 },
      rake: { percent: 5, capBb: 3 },
    } as unknown as Parameters<typeof serializeGameState>[0];
  }

  const willWinOf = (s: ReturnType<typeof serializeGameState>, id: string) =>
    s.players.find((p) => p.id === id)!.willWin;

  it('пара тузов бьёт пару королей на безопасном борде → willWin=true', () => {
    // Колода без короля (Ks→7c на позиции turn) → итоговый борд 2h 5d 9c 7c 3s, без пары/трипса
    // ни для чьих карманных. AA даёт старшую пару, KK — вторую пару, выше не поднимается.
    const room = makeWillWinRoom('Ah As', 'Kd Kc', '3s Th 7c Jd 9c 5d 2h Qc');
    const s = serializeGameState(room, 'A', true); // A смотрит с peek
    expect(willWinOf(s, 'A')).toBe(true);
  });

  it('трипс королей (карман + борд) бьёт пару тузов → willWin=false', () => {
    // Борд содержит Ks — у Bob (Kd Kc) трипс, у Alice (AA) только пара.
    const room = makeWillWinRoom('Ah As', 'Kd Kc');
    const s = serializeGameState(room, 'B', true); // теперь смотрит B (у него трипс)
    expect(willWinOf(s, 'B')).toBe(true);
    expect(willWinOf(s, 'A')).toBeUndefined(); // чужое willWin не считается и не отдаётся
  });

  it('без peek (обычный игрок, даже свой viewerId) → willWin всегда undefined', () => {
    const room = makeWillWinRoom('Ah As', 'Kd Kc');
    const s = serializeGameState(room, 'A', false);
    expect(willWinOf(s, 'A')).toBeUndefined();
  });

  it('сфолдивший (даже с peek) → willWin undefined — раздача для него уже решена', () => {
    const room = makeWillWinRoom('Ah As', 'Kd Kc');
    (room as unknown as { players: Map<string, { isFolded: boolean }> }).players.get('A')!.isFolded = true;
    const s = serializeGameState(room, 'A', true);
    expect(willWinOf(s, 'A')).toBeUndefined();
  });

  it('все остальные сфолдили → willWin=true (банк мой без вскрытия)', () => {
    const room = makeWillWinRoom('Ah As', 'Kd Kc');
    (room as unknown as { players: Map<string, { isFolded: boolean }> }).players.get('B')!.isFolded = true;
    const s = serializeGameState(room, 'A', true);
    expect(willWinOf(s, 'A')).toBe(true);
  });
});

// Бейджи активных спец-режимов над столом (ROADMAP §9.1): раньше о режимах можно было узнать
// только в модалке до посадки, хотя они меняют ход раздачи и деньги.
describe('activeTableModes — бейджи режимов стола', () => {
  const room = (opts: Record<string, unknown>) =>
    ({ ante: 0, straddleEnabled: false, bombPotEnabled: false, doubleBoardEnabled: false,
       rimtEnabled: false, evCashoutEnabled: false, noTurnNoShowEnabled: false, ...opts }) as
      Parameters<typeof activeTableModes>[0];

  it('обычный стол — режимов нет', () => {
    expect(activeTableModes(room({}))).toEqual([]);
  });

  it('анте попадает в список только когда оно ненулевое', () => {
    expect(activeTableModes(room({ ante: 0 }))).toEqual([]);
    expect(activeTableModes(room({ ante: 5 }))).toEqual(['ante']);
  });

  it('несколько режимов идут в фиксированном порядке', () => {
    expect(activeTableModes(room({ ante: 5, straddleEnabled: true, doubleBoardEnabled: true })))
      .toEqual(['ante', 'straddle', 'doubleBoard']);
  });

  it('EV Cashout вытесняет RIMT — иначе бейджи врут об одном и том же all-in', () => {
    expect(activeTableModes(room({ rimtEnabled: true, evCashoutEnabled: true }))).toEqual(['evCashout']);
    expect(activeTableModes(room({ rimtEnabled: true }))).toEqual(['rimt']);
  });

  it('сериализатор не кладёт поле в state, когда режимов нет (не раздуваем broadcast)', () => {
    expect(serializeGameState(makeRoom()).tableModes).toBeUndefined();
  });
});
