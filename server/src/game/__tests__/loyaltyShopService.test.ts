import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { clearStorage, setStorage, getStorage } from './helpers/storage.js';
import { resetStorage, createTestGameManager } from './helpers/gameManager.js';
import { TournamentManager } from '../tournament/TournamentManager.js';
import type { GameManager } from '../GameManager.js';
import {
  getShopCatalog,
  updateShopSettings,
  getShopItem,
  isRedemptionBlocked,
  recordRedemption,
  redeemShopItem,
} from '../loyaltyShopService.js';
import { getBalance, credit as creditWallet } from '../rewardsWalletService.js';

const netA = { ip: '1.1.1.1', deviceId: 'dA' };
const netB = { ip: '2.2.2.2', deviceId: 'dB' };

describe('loyaltyShopService — каталог и настройки', () => {
  beforeEach(() => clearStorage());

  it('getShopCatalog отдаёт дефолтный каталог, если файла нет', () => {
    const cfg = getShopCatalog();
    expect(cfg.enabled).toBe(false);
    expect(cfg.catalog.length).toBeGreaterThan(0);
  });

  it('updateShopSettings патчит enabled/catalog', () => {
    const updated = updateShopSettings({ enabled: true, catalog: [{ id: 'x', title: 'X', cost: 100, ticketBuyIn: 50 }] });
    expect(updated).toEqual({ enabled: true, catalog: [{ id: 'x', title: 'X', cost: 100, ticketBuyIn: 50 }] });
  });

  it('дубли id в каталоге отбрасываются', () => {
    const withDupe = [
      { id: 'x', title: 'A', cost: 1, ticketBuyIn: 1 },
      { id: 'x', title: 'B', cost: 2, ticketBuyIn: 2 },
    ];
    const updated = updateShopSettings({ catalog: withDupe });
    expect(updated.catalog).toHaveLength(1);
    expect(updated.catalog[0].title).toBe('A');
  });

  it('getShopItem находит по id, иначе null', () => {
    updateShopSettings({ catalog: [{ id: 'x', title: 'X', cost: 100, ticketBuyIn: 50 }] });
    expect(getShopItem('x')).toMatchObject({ id: 'x', cost: 100 });
    expect(getShopItem('ghost')).toBeNull();
  });

  it('санитизация — повреждённый каталог на диске не роняет чтение', () => {
    setStorage('loyalty-shop.json', { enabled: 'yes', catalog: 'garbage', networkClaims: null });
    expect(() => getShopCatalog()).not.toThrow();
    expect(getShopCatalog().enabled).toBe(false); // невалидный enabled → дефолт
  });
});

describe('loyaltyShopService — анти-фарм', () => {
  beforeEach(() => clearStorage());

  it('свежий юзер не заблокирован', () => {
    expect(isRedemptionBlocked('u1', netA)).toBe(false);
  });

  it('другой userId с той же сетью — заблокирован', () => {
    recordRedemption('u1', netA);
    expect(isRedemptionBlocked('u2', netA)).toBe(true);
  });

  it('тот же userId с той же сетью — НЕ заблокирован (повторная покупка собой же)', () => {
    recordRedemption('u1', netA);
    expect(isRedemptionBlocked('u1', netA)).toBe(false);
  });

  it('разные сети — не блокируется', () => {
    recordRedemption('u1', netA);
    expect(isRedemptionBlocked('u2', netB)).toBe(false);
  });
});

describe('loyaltyShopService — redeemShopItem (интеграция с реальным TournamentManager)', () => {
  const net = { ip: '9.9.9.9', deviceId: 'shopDevice' };

  beforeEach(() => {
    resetStorage({
      users: [
        { id: 'A', username: 'Alice', chips: 5000 },
        { id: 'B', username: 'Bob', chips: 5000 },
        { id: 'C', username: 'Carol', chips: 5000 },
      ],
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  async function setupTournament(buyIn: number, tableSize = 9) {
    const { gm } = await createTestGameManager();
    const tm = new TournamentManager(gm as unknown as GameManager);
    const created = tm.create(
      { name: 'SNG', type: 'sng', format: 'nlh', buyIn, startingStack: 1000, tableSize, blindSpeed: 'regular', levelUpMinutes: 10 },
      'admin1',
    );
    if ('error' in created) throw new Error(created.error);
    return { tm, tournamentId: created.id };
  }

  it('успешный редемпшн: HUB-коины списаны, банкролл НЕ тронут, prizePool растёт, игрок зарегистрирован', async () => {
    updateShopSettings({ catalog: [{ id: 'ticket-1000', title: 'X', cost: 300, ticketBuyIn: 1000 }] });
    creditWallet('A', 300, 'streak');
    const { tm, tournamentId } = await setupTournament(1000);

    const result = redeemShopItem(tm, 'A', 'Alice', 'ticket-1000', tournamentId, net);
    if ('error' in result) throw new Error(result.error);
    expect(result.tournament.prizePool).toBe(1000);
    expect(result.tournament.entries.find((e) => e.userId === 'A')?.status).toBe('registered');

    expect(getBalance('A')).toBe(0); // HUB-коины списаны
    const users = getStorage('users.json') as Array<{ id: string; chips: number }>;
    expect(users.find((u) => u.id === 'A')?.chips).toBe(5000); // реальный банкролл НЕ тронут
  });

  it('несовпадение бай-ина — отказ ДО списания HUB-коинов', async () => {
    updateShopSettings({ catalog: [{ id: 'ticket-500', title: 'X', cost: 300, ticketBuyIn: 500 }] });
    creditWallet('A', 300, 'streak');
    const { tm, tournamentId } = await setupTournament(1000); // турнир на 1000, тикет — на 500

    const result = redeemShopItem(tm, 'A', 'Alice', 'ticket-500', tournamentId, net);
    expect(result).toEqual({ error: 'buyin-mismatch' });
    expect(getBalance('A')).toBe(300); // не списано
  });

  it('недостаточно HUB-коинов — отказ, вход в турнир не создан', async () => {
    updateShopSettings({ catalog: [{ id: 'ticket-1000', title: 'X', cost: 300, ticketBuyIn: 1000 }] });
    const { tm, tournamentId } = await setupTournament(1000); // HUB-коины не начислялись

    const result = redeemShopItem(tm, 'A', 'Alice', 'ticket-1000', tournamentId, net);
    expect(result).toEqual({ error: 'insufficient-balance' });
    expect(tm.get(tournamentId)!.entries).toHaveLength(0);
  });

  it('анти-фарм: другой аккаунт с того же устройства не может редимить', async () => {
    updateShopSettings({ catalog: [{ id: 'ticket-1000', title: 'X', cost: 300, ticketBuyIn: 1000 }] });
    creditWallet('A', 300, 'streak');
    creditWallet('B', 300, 'streak');
    const { tm, tournamentId } = await setupTournament(1000, 9);
    redeemShopItem(tm, 'A', 'Alice', 'ticket-1000', tournamentId, net);

    const result = redeemShopItem(tm, 'B', 'Bob', 'ticket-1000', tournamentId, net); // то же устройство
    expect(result).toEqual({ error: 'network-blocked' });
    expect(getBalance('B')).toBe(300); // не списано — блок ДО дебета
  });

  it('турнир уже не принимает регистрацию — HUB-коины возвращаются, промокод деактивирован', async () => {
    updateShopSettings({ catalog: [{ id: 'ticket-0', title: 'X', cost: 300, ticketBuyIn: 0 }] });
    creditWallet('A', 300, 'streak');
    const { tm, tournamentId } = await setupTournament(0, 2); // free SNG, 2 места — авто-старт при заполнении
    expect(tm.register(tournamentId, 'B', 'Bob')).not.toHaveProperty('error');
    expect(tm.register(tournamentId, 'C', 'Carol')).not.toHaveProperty('error'); // заполнило стол → авто-старт
    expect(tm.get(tournamentId)!.status).not.toBe('registering'); // подтверждаем, что регистрация закрылась

    const result = redeemShopItem(tm, 'A', 'Alice', 'ticket-0', tournamentId, net);
    expect(result).toEqual({ error: 'registration-closed' });
    expect(getBalance('A')).toBe(300); // возвращено
    expect(tm.get(tournamentId)!.entries.some((e) => e.userId === 'A')).toBe(false);
  });
});
