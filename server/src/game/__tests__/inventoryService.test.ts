import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../auth/storage.js', () => import('./helpers/storage.js'));

import { clearStorage, setStorage } from './helpers/storage.js';
import {
  getCatalog,
  updateInventorySettings,
  getUserInventory,
  purchaseItem,
  equipItem,
  getResolvedEquipped,
  isEmojiOwned,
} from '../inventoryService.js';
import { credit as creditWallet, getBalance } from '../rewardsWalletService.js';

describe('inventoryService — каталог и настройки', () => {
  beforeEach(() => clearStorage());

  it('getCatalog отдаёт дефолтный каталог, если файла нет (магазин выключен)', () => {
    const cfg = getCatalog();
    expect(cfg.enabled).toBe(false);
    expect(cfg.catalog.length).toBeGreaterThan(0);
  });

  it('updateInventorySettings патчит enabled/catalog', () => {
    const item = { id: 'frame-x', type: 'avatarFrame' as const, name: 'X', cost: 100, value: 'gold' };
    const updated = updateInventorySettings({ enabled: true, catalog: [item] });
    expect(updated).toEqual({ enabled: true, catalog: [item] });
  });

  it('дубли id в каталоге отбрасываются', () => {
    const withDupe = [
      { id: 'x', type: 'title' as const, name: 'A', cost: 1, value: 'aaa' },
      { id: 'x', type: 'title' as const, name: 'B', cost: 2, value: 'bbb' },
    ];
    const updated = updateInventorySettings({ catalog: withDupe });
    expect(updated.catalog).toHaveLength(1);
    expect(updated.catalog[0].name).toBe('A');
  });

  it('avatarFrame с value не из FRAME_STYLES — санитизируется к дефолтному стилю', () => {
    const updated = updateInventorySettings({
      catalog: [{ id: 'x', type: 'avatarFrame', name: 'X', cost: 10, value: 'rainbow-glitch' }],
    });
    expect(updated.catalog[0].value).toBe('bronze');
  });

  it('title длиннее 24 символов — обрезается', () => {
    const long = 'A'.repeat(40);
    const updated = updateInventorySettings({
      catalog: [{ id: 'x', type: 'title', name: 'X', cost: 10, value: long }],
    });
    expect(updated.catalog[0].value).toHaveLength(24);
  });

  it('tableGlow с value не из TABLE_GLOW_STYLES — санитизируется к дефолтному стилю', () => {
    const updated = updateInventorySettings({
      catalog: [{ id: 'x', type: 'tableGlow', name: 'X', cost: 10, value: 'plaid' }],
    });
    expect(updated.catalog[0].value).toBe('emerald');
  });

  it('emoji длиннее 8 символов — обрезается', () => {
    const long = '💎'.repeat(10);
    const updated = updateInventorySettings({
      catalog: [{ id: 'x', type: 'emoji', name: 'X', cost: 10, value: long }],
    });
    expect(updated.catalog[0].value.length).toBeLessThanOrEqual(8);
  });

  it('неизвестный type в каталоге на диске — санитизируется к avatarFrame', () => {
    const updated = updateInventorySettings({
      catalog: [{ id: 'x', type: 'mystery-box' as never, name: 'X', cost: 10, value: 'gold' }],
    });
    expect(updated.catalog[0].type).toBe('avatarFrame');
  });

  it('санитизация — повреждённый каталог на диске не роняет чтение', () => {
    setStorage('inventory.json', { enabled: 'yes', catalog: 'garbage', owned: null, equipped: null });
    expect(() => getCatalog()).not.toThrow();
    expect(getCatalog().enabled).toBe(false);
  });
});

describe('inventoryService — покупка', () => {
  beforeEach(() => clearStorage());

  it('покупка списывает HUB-коины и добавляет предмет в owned', () => {
    updateInventorySettings({ enabled: true, catalog: [{ id: 'frame-gold', type: 'avatarFrame', name: 'Gold', cost: 500, value: 'gold' }] });
    creditWallet('u1', 1000, 'mission');
    const result = purchaseItem('u1', 'frame-gold');
    expect(result).toEqual({ ok: true });
    expect(getBalance('u1')).toBe(500);
    expect(getUserInventory('u1').owned).toEqual(['frame-gold']);
  });

  it('магазин выключен — покупка отклоняется', () => {
    updateInventorySettings({ enabled: false, catalog: [{ id: 'frame-gold', type: 'avatarFrame', name: 'Gold', cost: 500, value: 'gold' }] });
    creditWallet('u1', 1000, 'mission');
    expect(purchaseItem('u1', 'frame-gold')).toEqual({ error: 'shop-disabled' });
  });

  it('недостаточно HUB-коинов — баланс не меняется', () => {
    updateInventorySettings({ enabled: true, catalog: [{ id: 'frame-gold', type: 'avatarFrame', name: 'Gold', cost: 500, value: 'gold' }] });
    creditWallet('u1', 100, 'mission');
    expect(purchaseItem('u1', 'frame-gold')).toEqual({ error: 'insufficient-balance' });
    expect(getBalance('u1')).toBe(100);
  });

  it('повторная покупка уже купленного предмета отклоняется', () => {
    updateInventorySettings({ enabled: true, catalog: [{ id: 'frame-gold', type: 'avatarFrame', name: 'Gold', cost: 500, value: 'gold' }] });
    creditWallet('u1', 2000, 'mission');
    purchaseItem('u1', 'frame-gold');
    expect(purchaseItem('u1', 'frame-gold')).toEqual({ error: 'already-owned' });
    expect(getBalance('u1')).toBe(1500); // списалось только один раз
  });

  it('несуществующий предмет — ошибка', () => {
    updateInventorySettings({ enabled: true, catalog: [{ id: 'frame-gold', type: 'avatarFrame', name: 'Gold', cost: 500, value: 'gold' }] });
    expect(purchaseItem('u1', 'ghost')).toEqual({ error: 'item-not-found' });
  });

  it('покупки разных юзеров изолированы', () => {
    updateInventorySettings({ enabled: true, catalog: [{ id: 'frame-gold', type: 'avatarFrame', name: 'Gold', cost: 500, value: 'gold' }] });
    creditWallet('u1', 1000, 'mission');
    creditWallet('u2', 1000, 'mission');
    purchaseItem('u1', 'frame-gold');
    expect(getUserInventory('u1').owned).toEqual(['frame-gold']);
    expect(getUserInventory('u2').owned).toEqual([]);
  });
});

describe('inventoryService — эксклюзивные эмодзи (isEmojiOwned)', () => {
  beforeEach(() => clearStorage());

  it('до покупки — эмодзи не в собственности', () => {
    updateInventorySettings({ enabled: true, catalog: [{ id: 'emoji-shark', type: 'emoji', name: 'Shark', cost: 300, value: '🦈' }] });
    expect(isEmojiOwned('u1', '🦈')).toBe(false);
  });

  it('после покупки — isEmojiOwned true для купленного символа', () => {
    updateInventorySettings({ enabled: true, catalog: [{ id: 'emoji-shark', type: 'emoji', name: 'Shark', cost: 300, value: '🦈' }] });
    creditWallet('u1', 1000, 'mission');
    purchaseItem('u1', 'emoji-shark');
    expect(isEmojiOwned('u1', '🦈')).toBe(true);
  });

  it('владение эмодзи не даёт владения ЧУЖИМ эксклюзивным эмодзи', () => {
    updateInventorySettings({
      enabled: true,
      catalog: [
        { id: 'emoji-shark', type: 'emoji', name: 'Shark', cost: 300, value: '🦈' },
        { id: 'emoji-crown', type: 'emoji', name: 'Crown', cost: 500, value: '👑' },
      ],
    });
    creditWallet('u1', 1000, 'mission');
    purchaseItem('u1', 'emoji-shark');
    expect(isEmojiOwned('u1', '👑')).toBe(false);
  });

  it('эмодзи изолированы по юзерам', () => {
    updateInventorySettings({ enabled: true, catalog: [{ id: 'emoji-shark', type: 'emoji', name: 'Shark', cost: 300, value: '🦈' }] });
    creditWallet('u1', 1000, 'mission');
    purchaseItem('u1', 'emoji-shark');
    expect(isEmojiOwned('u2', '🦈')).toBe(false);
  });
});

describe('inventoryService — экипировка', () => {
  beforeEach(() => clearStorage());

  const seedCatalog = () =>
    updateInventorySettings({
      enabled: true,
      catalog: [
        { id: 'frame-gold', type: 'avatarFrame', name: 'Gold', cost: 500, value: 'gold' },
        { id: 'title-legend', type: 'title', name: 'Legend', cost: 500, value: 'Легенда' },
      ],
    });

  it('нельзя экипировать не купленный предмет', () => {
    seedCatalog();
    expect(equipItem('u1', 'frame-gold', 'avatarFrame')).toEqual({ error: 'not-owned' });
  });

  it('экипировка купленного предмета — успешна, резолвится в value', () => {
    seedCatalog();
    creditWallet('u1', 1000, 'mission');
    purchaseItem('u1', 'frame-gold');
    const result = equipItem('u1', 'frame-gold', 'avatarFrame');
    expect(result).toEqual({ ok: true, equipped: { frame: 'frame-gold' } });
    expect(getResolvedEquipped('u1')).toEqual({ frame: 'gold' });
  });

  it('рамка и титул экипируются независимо (оба одновременно)', () => {
    seedCatalog();
    creditWallet('u1', 2000, 'mission');
    purchaseItem('u1', 'frame-gold');
    purchaseItem('u1', 'title-legend');
    equipItem('u1', 'frame-gold', 'avatarFrame');
    equipItem('u1', 'title-legend', 'title');
    expect(getResolvedEquipped('u1')).toEqual({ frame: 'gold', title: 'Легенда' });
  });

  it('itemId=null снимает текущий предмет этого типа', () => {
    seedCatalog();
    creditWallet('u1', 1000, 'mission');
    purchaseItem('u1', 'frame-gold');
    equipItem('u1', 'frame-gold', 'avatarFrame');
    const result = equipItem('u1', null, 'avatarFrame');
    expect(result).toEqual({ ok: true, equipped: {} });
    expect(getResolvedEquipped('u1')).toEqual({});
  });

  it('нельзя экипировать title как avatarFrame (несовпадение типа)', () => {
    seedCatalog();
    creditWallet('u1', 1000, 'mission');
    purchaseItem('u1', 'title-legend');
    expect(equipItem('u1', 'title-legend', 'avatarFrame')).toEqual({ error: 'item-not-found' });
  });

  it('пользователь без экипированных предметов — пустой резолв', () => {
    seedCatalog();
    expect(getResolvedEquipped('ghost-user')).toEqual({});
  });

  it('tableGlow экипируется независимо от frame/title, но НЕ входит в getResolvedEquipped', () => {
    updateInventorySettings({
      enabled: true,
      catalog: [{ id: 'glow-ruby', type: 'tableGlow', name: 'Ruby', cost: 400, value: 'ruby' }],
    });
    creditWallet('u1', 1000, 'mission');
    purchaseItem('u1', 'glow-ruby');
    const result = equipItem('u1', 'glow-ruby', 'tableGlow');
    expect(result).toEqual({ ok: true, equipped: { tableGlow: 'glow-ruby' } });
    // getResolvedEquipped транспортирует в GameState только frame/title — tableGlow видна
    // только владельцу, клиент резолвит её сам из /api/inventory/me (не broadcast-поле).
    expect(getResolvedEquipped('u1')).toEqual({});
  });
});
