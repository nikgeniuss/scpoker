import type { TimebankConfig, TimebankSettings, CreateRoomOptions } from './GameManager.js';
import { validateRakeConfig } from './rake.js';

// Чистые функции валидации/трансформации конфига комнаты — вынесены из GameManager (ROADMAP §9.3-B).
// Без состояния/io/socket: тестируются изолированно (эталон hands.ts/deck.ts). Сообщения 1:1 с прежними.

// Преобразовать глобальный TimebankSettings в per-table TimebankConfig (без override-флага)
export function toRoomTimebank(s: TimebankSettings): TimebankConfig {
  return {
    enabled: s.enabled,
    startSec: s.startSec,
    bonusSec: s.bonusSec,
    bonusEveryHands: s.bonusEveryHands,
    capSec: s.capSec,
  };
}

// Валидация per-table timebank-конфига (из CreateRoomOptions)
export function validateTimebankConfig(tb: TimebankConfig): string | null {
  if (typeof tb.enabled !== 'boolean') return 'timebank.enabled: boolean';
  if (!Number.isInteger(tb.startSec) || tb.startSec < 0 || tb.startSec > 600) {
    return 'timebank.startSec: 0..600';
  }
  if (!Number.isInteger(tb.bonusSec) || tb.bonusSec < 0 || tb.bonusSec > 600) {
    return 'timebank.bonusSec: 0..600';
  }
  if (!Number.isInteger(tb.bonusEveryHands) || tb.bonusEveryHands < 1 || tb.bonusEveryHands > 1000) {
    return 'timebank.bonusEveryHands: 1..1000';
  }
  if (!Number.isInteger(tb.capSec) || tb.capSec < tb.startSec || tb.capSec > 600) {
    return 'timebank.capSec: startSec..600';
  }
  return null;
}

// Валидация опций создания комнаты
export function validateCreateOptions(opts: CreateRoomOptions): string | null {
  if (!opts.name || opts.name.length < 3 || opts.name.length > 32) {
    return 'Название должно быть от 3 до 32 символов';
  }
  if (!Number.isInteger(opts.smallBlind) || opts.smallBlind <= 0) {
    return 'Малый блайнд должен быть положительным целым';
  }
  if (!Number.isInteger(opts.bigBlind) || opts.bigBlind <= 0) {
    return 'Большой блайнд должен быть положительным целым';
  }
  if (opts.bigBlind < opts.smallBlind * 2) {
    return 'Большой блайнд должен быть не меньше 2× малого';
  }
  if (!Number.isInteger(opts.maxPlayers) || opts.maxPlayers < 2 || opts.maxPlayers > 12) {
    return 'Лимит игроков — от 2 до 12';
  }
  if (
    !Number.isInteger(opts.turnDurationSec) ||
    opts.turnDurationSec < 5 ||
    opts.turnDurationSec > 120
  ) {
    return 'Время хода — от 5 до 120 секунд';
  }
  if (
    !Number.isInteger(opts.buyInMinBb) ||
    opts.buyInMinBb < 5 ||
    opts.buyInMinBb > 1000
  ) {
    return 'Минимальный бай-ин — от 5 до 1000 BB';
  }
  if (
    !Number.isInteger(opts.buyInMaxBb) ||
    opts.buyInMaxBb < opts.buyInMinBb ||
    opts.buyInMaxBb > 1000
  ) {
    return 'Максимальный бай-ин должен быть не меньше минимального и не больше 1000 BB';
  }
  if (opts.password !== undefined && opts.password.length > 0 && opts.password.length < 4) {
    return 'Пароль — минимум 4 символа';
  }
  if (opts.description !== undefined && typeof opts.description !== 'string') {
    return 'Описание должно быть строкой';
  }
  if (opts.description !== undefined && opts.description.length > 200) {
    return 'Описание — не больше 200 символов';
  }
  if (opts.rake !== undefined) {
    const rakeErr = validateRakeConfig(opts.rake);
    if (rakeErr) return rakeErr;
  }
  if (opts.ante !== undefined) {
    if (!Number.isInteger(opts.ante) || opts.ante < 0 || opts.ante > opts.bigBlind) {
      return 'Анте — целое от 0 до большого блайнда';
    }
  }
  if (opts.sessionDurationHours !== undefined) {
    if (!Number.isInteger(opts.sessionDurationHours) || opts.sessionDurationHours < 0 || opts.sessionDurationHours > 24) {
      return 'Длительность игры — 0..24 часа';
    }
  }
  if (opts.autoStartPlayers !== undefined) {
    if (!Number.isInteger(opts.autoStartPlayers) || opts.autoStartPlayers < 2 || opts.autoStartPlayers > opts.maxPlayers) {
      return 'Автостарт — от 2 до размера стола';
    }
  }
  if (opts.sitOutTimeoutMin !== undefined) {
    if (!Number.isInteger(opts.sitOutTimeoutMin) || opts.sitOutTimeoutMin < 5 || opts.sitOutTimeoutMin > 30) {
      return 'Время сит-аута — от 5 до 30 минут';
    }
  }
  if (opts.waitlistDelayMin !== undefined) {
    if (!Number.isInteger(opts.waitlistDelayMin) || opts.waitlistDelayMin < 2 || opts.waitlistDelayMin > 10) {
      return 'Задержка очереди — от 2 до 10 минут';
    }
  }
  return null;
}
