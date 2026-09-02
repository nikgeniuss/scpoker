import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { resetStorage, createTestGameManager } from './helpers/gameManager.js';
import { getStorage } from './helpers/storage.js';
import { TournamentManager } from '../tournament/TournamentManager.js';
import type { GameManager } from '../GameManager.js';

// Промокоды на бесплатный вход (§10.x, 2026-08-27): валидны по совпадению buyIn для ЛЮБОГО турнира,
// НЕ привязаны к одному турниру (как тикеты у 888poker/Borgata — точное совпадение суммы, без
// комбинирования). Ключевой инвариант: погашение НЕ трогает банкролл (рум платит бай-ин сам, как
// fillWithBots/guarantee-оверлей) — unregister()/cancel() не должны возвращать деньги, которых
// игрок не платил.

function usersChips(): Record<string, number> {
  const users = getStorage('users.json') as Array<{ id: string; chips: number }>;
  return Object.fromEntries(users.map((u) => [u.id, u.chips]));
}

describe('TournamentManager — промокоды на бесплатный вход', () => {
  beforeEach(() => {
    resetStorage({
      users: ['A', 'B', 'C'].map((id) => ({ id, username: id, chips: 5000 })),
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('createPromoCode: валидация buyIn/лимита, успешное создание', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);

    expect(tm.createPromoCode(-1, 5, 'admin1')).toEqual({ error: 'invalid-buyin' });
    expect(tm.createPromoCode(1000, 0, 'admin1')).toEqual({ error: 'invalid-max-redemptions' });
    expect(tm.createPromoCode(1000, 1001, 'admin1')).toEqual({ error: 'invalid-max-redemptions' });
    expect(tm.createPromoCode(1000, 5.5, 'admin1')).toEqual({ error: 'invalid-max-redemptions' });

    const promo = tm.createPromoCode(1000, 2, 'admin1');
    if ('error' in promo) throw new Error(promo.error);
    expect(promo.buyIn).toBe(1000);
    expect(promo.maxRedemptions).toBe(2);
    expect(promo.redeemedBy).toEqual([]);
    expect(promo.active).toBe(true);
    expect(tm.listPromoCodes()).toEqual([promo]);
  });

  it('create() с promoEnabled автоматически генерирует код на buyIn турнира', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);

    expect(
      tm.create(
        { name: 'X', type: 'sng', format: 'nlh', buyIn: 1000, startingStack: 1000, tableSize: 6, blindSpeed: 'regular', levelUpMinutes: 10, promoEnabled: true },
        'admin1',
      ),
    ).toEqual({ error: 'invalid-promo-max-redemptions' });

    const created = tm.create(
      { name: 'X', type: 'sng', format: 'nlh', buyIn: 1000, startingStack: 1000, tableSize: 6, blindSpeed: 'regular', levelUpMinutes: 10, promoEnabled: true, promoMaxRedemptions: 3 },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    expect(created.promoCode).toBeTruthy();
    const promo = tm.listPromoCodes().find((p) => p.code === created.promoCode);
    expect(promo).toMatchObject({ buyIn: 1000, maxRedemptions: 3 });
  });

  it('погашение: регистрирует БЕЗ списания банкролла, prizePool растёт как за обычный бай-ин', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const promo = tm.createPromoCode(1000, 2, 'admin1');
    if ('error' in promo) throw new Error(promo.error);

    const created = tm.create(
      { name: 'SNG', type: 'sng', format: 'nlh', buyIn: 1000, startingStack: 1000, tableSize: 6, blindSpeed: 'regular', levelUpMinutes: 10 },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);

    const result = tm.redeemPromoCode(created.id, 'A', 'Alice', promo.code);
    if ('error' in result) throw new Error(result.error);
    expect(result.prizePool).toBe(1000);
    const entry = result.entries.find((e) => e.userId === 'A')!;
    expect(entry.status).toBe('registered');
    expect(entry.promoCode).toBe(promo.code);
    expect(usersChips()).toMatchObject({ A: 5000 }); // банкролл не тронут

    expect(tm.listPromoCodes().find((p) => p.code === promo.code)!.redeemedBy).toEqual(['A']);
  });

  it('код принимается регистронезависимо (нормализация на роуте — тут проверяем прямое совпадение верхнего регистра)', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const promo = tm.createPromoCode(1000, 1, 'admin1');
    if ('error' in promo) throw new Error(promo.error);
    const created = tm.create(
      { name: 'SNG', type: 'sng', format: 'nlh', buyIn: 1000, startingStack: 1000, tableSize: 6, blindSpeed: 'regular', levelUpMinutes: 10 },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);

    expect(tm.redeemPromoCode(created.id, 'A', 'Alice', 'not-a-real-code')).toEqual({ error: 'invalid-promo-code' });
  });

  it('несовпадение суммы бай-ина отклоняется', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const promo = tm.createPromoCode(500, 5, 'admin1'); // код на $5
    if ('error' in promo) throw new Error(promo.error);

    const created = tm.create(
      { name: 'SNG $10', type: 'sng', format: 'nlh', buyIn: 1000, startingStack: 1000, tableSize: 6, blindSpeed: 'regular', levelUpMinutes: 10 },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);

    expect(tm.redeemPromoCode(created.id, 'A', 'Alice', promo.code)).toEqual({ error: 'promo-buyin-mismatch' });
  });

  it('лимит погашений: третий игрок получает отказ после исчерпания лимита', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const promo = tm.createPromoCode(1000, 2, 'admin1');
    if ('error' in promo) throw new Error(promo.error);
    const created = tm.create(
      { name: 'SNG', type: 'sng', format: 'nlh', buyIn: 1000, startingStack: 1000, tableSize: 9, blindSpeed: 'regular', levelUpMinutes: 10 },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);

    expect(tm.redeemPromoCode(created.id, 'A', 'Alice', promo.code)).not.toHaveProperty('error');
    expect(tm.redeemPromoCode(created.id, 'B', 'Bob', promo.code)).not.toHaveProperty('error');
    expect(tm.redeemPromoCode(created.id, 'C', 'Carol', promo.code)).toEqual({ error: 'promo-limit-reached' });
  });

  it('один и тот же игрок не может погасить один код дважды (в разных турнирах с тем же buyIn)', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const promo = tm.createPromoCode(1000, 5, 'admin1');
    if ('error' in promo) throw new Error(promo.error);
    const t1 = tm.create(
      { name: 'SNG 1', type: 'sng', format: 'nlh', buyIn: 1000, startingStack: 1000, tableSize: 9, blindSpeed: 'regular', levelUpMinutes: 10 },
      'admin1',
    );
    const t2 = tm.create(
      { name: 'SNG 2', type: 'sng', format: 'nlh', buyIn: 1000, startingStack: 1000, tableSize: 9, blindSpeed: 'regular', levelUpMinutes: 10 },
      'admin1',
    );
    if ('error' in t1 || 'error' in t2) throw new Error('setup');

    expect(tm.redeemPromoCode(t1.id, 'A', 'Alice', promo.code)).not.toHaveProperty('error');
    expect(tm.redeemPromoCode(t2.id, 'A', 'Alice', promo.code)).toEqual({ error: 'promo-already-used' });
  });

  it('деактивированный код больше не гасится', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const promo = tm.createPromoCode(1000, 5, 'admin1');
    if ('error' in promo) throw new Error(promo.error);
    tm.deactivatePromoCode(promo.code);
    const created = tm.create(
      { name: 'SNG', type: 'sng', format: 'nlh', buyIn: 1000, startingStack: 1000, tableSize: 9, blindSpeed: 'regular', levelUpMinutes: 10 },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);

    expect(tm.redeemPromoCode(created.id, 'A', 'Alice', promo.code)).toEqual({ error: 'invalid-promo-code' });
  });

  it('unregister после входа по промо: НЕ возвращает банкролл, освобождает слот погашения', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const promo = tm.createPromoCode(1000, 1, 'admin1');
    if ('error' in promo) throw new Error(promo.error);
    const created = tm.create(
      { name: 'SNG', type: 'sng', format: 'nlh', buyIn: 1000, startingStack: 1000, tableSize: 9, blindSpeed: 'regular', levelUpMinutes: 10 },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);

    tm.redeemPromoCode(created.id, 'A', 'Alice', promo.code);
    expect(usersChips()).toMatchObject({ A: 5000 });

    const after = tm.unregister(created.id, 'A');
    if ('error' in after) throw new Error(after.error);
    expect(after.prizePool).toBe(0);
    expect(usersChips()).toMatchObject({ A: 5000 }); // не получил обратно то, чего не платил
    expect(tm.listPromoCodes().find((p) => p.code === promo.code)!.redeemedBy).toEqual([]);

    // Слот освободился — тот же игрок может погасить код заново.
    const again = tm.redeemPromoCode(created.id, 'A', 'Alice', promo.code);
    expect('error' in again).toBe(false);
  });

  it('cancel() турнира с промо-входами: не возвращает банкролл промо-игрокам, обычным — возвращает', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const promo = tm.createPromoCode(1000, 5, 'admin1');
    if ('error' in promo) throw new Error(promo.error);
    const created = tm.create(
      { name: 'SNG', type: 'sng', format: 'nlh', buyIn: 1000, startingStack: 1000, tableSize: 9, blindSpeed: 'regular', levelUpMinutes: 10 },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);

    tm.redeemPromoCode(created.id, 'A', 'Alice', promo.code); // промо, банкролл не трогается
    tm.register(created.id, 'B', 'Bob'); // обычная регистрация, списывает 1000
    expect(usersChips()).toMatchObject({ A: 5000, B: 4000 });

    tm.cancel(created.id);
    expect(usersChips()).toMatchObject({ A: 5000, B: 5000 }); // A не разбогател, B вернули его же деньги
    expect(tm.listPromoCodes().find((p) => p.code === promo.code)!.redeemedBy).toEqual([]);
  });

  it('SNG: заполнение последнего места промокодом триггерит авто-старт как обычная регистрация', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const promo = tm.createPromoCode(1000, 1, 'admin1');
    if ('error' in promo) throw new Error(promo.error);
    const created = tm.create(
      { name: 'Heads-up SNG', type: 'sng', format: 'nlh', buyIn: 1000, startingStack: 1000, tableSize: 2, blindSpeed: 'regular', levelUpMinutes: 10 },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);

    tm.register(created.id, 'A', 'Alice');
    const result = tm.redeemPromoCode(created.id, 'B', 'Bob', promo.code);
    if ('error' in result) throw new Error(result.error);
    expect(tm.get(created.id)!.status).not.toBe('registering'); // авто-старт сработал
  });

  it('MTT поздняя регистрация по промо: сажает за стол, играет, без списания банкролла', async () => {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const promo = tm.createPromoCode(0, 1, 'admin1'); // фрибай MTT (buyIn=0) — крайний случай суммы
    if ('error' in promo) throw new Error(promo.error);
    const created = tm.create(
      { name: 'Free MTT', type: 'mtt', format: 'nlh', buyIn: 0, startingStack: 1000, tableSize: 2, blindSpeed: 'turbo', levelUpMinutes: 10, lateRegMinutes: 10 },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);

    tm.register(created.id, 'A', 'Alice');
    tm.register(created.id, 'B', 'Bob');
    const started = tm.forceStart(created.id);
    if ('error' in started) throw new Error(started.error);

    const result = tm.redeemPromoCode(created.id, 'C', 'Carol', promo.code);
    if ('error' in result) throw new Error(result.error);
    const entry = result.entries.find((e) => e.userId === 'C')!;
    expect(entry.status).toBe('playing');
    expect(entry.tableId).toBeTruthy();
    expect(usersChips()).toMatchObject({ C: 5000 }); // банкролл не тронут даже на бай-ин 0
  });
});
