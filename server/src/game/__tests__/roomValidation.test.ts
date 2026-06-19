import { describe, it, expect } from 'vitest';
import { toRoomTimebank, validateTimebankConfig, validateCreateOptions } from '../roomValidation.js';
import type { CreateRoomOptions, TimebankConfig } from '../GameManager.js';

// Чистые функции конфига комнаты (вынесены из GameManager, ROADMAP §9.3-B).
// Проверяем границы валидации и трансформацию таймбанка.

const validOpts = (over: Partial<CreateRoomOptions> = {}): CreateRoomOptions => ({
  name: 'Стол',
  smallBlind: 10,
  bigBlind: 20,
  maxPlayers: 6,
  turnDurationSec: 20,
  buyInMinBb: 20,
  buyInMaxBb: 100,
  ...over,
});

const validTb = (over: Partial<TimebankConfig> = {}): TimebankConfig => ({
  enabled: true,
  startSec: 30,
  bonusSec: 10,
  bonusEveryHands: 10,
  capSec: 60,
  ...over,
});

describe('validateCreateOptions', () => {
  it('корректные опции → null', () => {
    expect(validateCreateOptions(validOpts())).toBeNull();
  });

  it('имя короче 3 → ошибка', () => {
    expect(validateCreateOptions(validOpts({ name: 'AB' }))).toMatch(/от 3 до 32/);
  });

  it('имя длиннее 32 → ошибка', () => {
    expect(validateCreateOptions(validOpts({ name: 'x'.repeat(33) }))).toMatch(/от 3 до 32/);
  });

  it('BB < 2×SB → ошибка', () => {
    expect(validateCreateOptions(validOpts({ smallBlind: 10, bigBlind: 15 }))).toMatch(/не меньше 2/);
  });

  it('maxPlayers вне 2..12 → ошибка', () => {
    expect(validateCreateOptions(validOpts({ maxPlayers: 1 }))).toMatch(/от 2 до 12/);
    expect(validateCreateOptions(validOpts({ maxPlayers: 13 }))).toMatch(/от 2 до 12/);
  });

  it('turnDurationSec вне 5..120 → ошибка', () => {
    expect(validateCreateOptions(validOpts({ turnDurationSec: 4 }))).toMatch(/от 5 до 120/);
    expect(validateCreateOptions(validOpts({ turnDurationSec: 121 }))).toMatch(/от 5 до 120/);
  });

  it('buyInMaxBb < buyInMinBb → ошибка', () => {
    expect(validateCreateOptions(validOpts({ buyInMinBb: 50, buyInMaxBb: 40 }))).toMatch(/не меньше минимального/);
  });

  it('короткий пароль (1..3 симв.) → ошибка, пустой/длинный — ок', () => {
    expect(validateCreateOptions(validOpts({ password: 'ab' }))).toMatch(/минимум 4/);
    expect(validateCreateOptions(validOpts({ password: '' }))).toBeNull();
    expect(validateCreateOptions(validOpts({ password: 'abcd' }))).toBeNull();
  });

  it('описание длиннее 200 → ошибка', () => {
    expect(validateCreateOptions(validOpts({ description: 'x'.repeat(201) }))).toMatch(/не больше 200/);
  });
});

describe('validateTimebankConfig', () => {
  it('корректный конфиг → null', () => {
    expect(validateTimebankConfig(validTb())).toBeNull();
  });

  it('enabled не boolean → ошибка', () => {
    expect(validateTimebankConfig(validTb({ enabled: 1 as unknown as boolean }))).toMatch(/enabled/);
  });

  it('startSec вне 0..600 → ошибка', () => {
    expect(validateTimebankConfig(validTb({ startSec: -1 }))).toMatch(/startSec/);
    expect(validateTimebankConfig(validTb({ startSec: 601 }))).toMatch(/startSec/);
  });

  it('capSec меньше startSec → ошибка', () => {
    expect(validateTimebankConfig(validTb({ startSec: 60, capSec: 30 }))).toMatch(/capSec/);
  });

  it('bonusEveryHands вне 1..1000 → ошибка', () => {
    expect(validateTimebankConfig(validTb({ bonusEveryHands: 0 }))).toMatch(/bonusEveryHands/);
  });
});

describe('toRoomTimebank', () => {
  it('копирует поля, отбрасывает allowPerTableOverride', () => {
    const result = toRoomTimebank({
      enabled: true, startSec: 30, bonusSec: 10, bonusEveryHands: 10, capSec: 60,
      allowPerTableOverride: true,
    });
    expect(result).toEqual({ enabled: true, startSec: 30, bonusSec: 10, bonusEveryHands: 10, capSec: 60 });
    expect('allowPerTableOverride' in result).toBe(false);
  });
});
