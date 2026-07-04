import { describe, it, expect } from 'vitest';
import { buildBlindSchedule, currentLevelForElapsed, msUntilNextLevel, nextLevelBigBlind } from '../tournamentSchedule.js';

describe('tournamentSchedule — генерация уровней блайндов', () => {
  it('первый уровень стартует с явно заданного большого блайнда (степпер в CreateTournamentModal)', () => {
    const schedule = buildBlindSchedule(20, 12);
    expect(schedule[0].bigBlind).toBe(20);
    expect(schedule[0].smallBlind).toBe(10);
  });

  it('значение вне лестницы стартует с ближайшего уровня НЕ НИЖЕ заданного', () => {
    const schedule = buildBlindSchedule(40, 12); // между 30 и 50 — берёт 50
    expect(schedule[0].bigBlind).toBe(50);
  });

  it('уровни монотонно растут и пронумерованы с 1', () => {
    const schedule = buildBlindSchedule(50, 6);
    schedule.forEach((lvl, i) => {
      expect(lvl.level).toBe(i + 1);
      if (i > 0) {
        expect(lvl.bigBlind).toBeGreaterThan(schedule[i - 1].bigBlind);
        expect(lvl.smallBlind).toBeGreaterThan(schedule[i - 1].smallBlind);
      }
    });
  });

  it('durationMin берётся из levelUpMinutes', () => {
    const slow = buildBlindSchedule(20, 20);
    const hyper = buildBlindSchedule(20, 3);
    const five = buildBlindSchedule(20, 5);
    expect(slow[0].durationMin).toBe(20);
    expect(hyper[0].durationMin).toBe(3);
    expect(five[0].durationMin).toBe(5);
  });

  it('анте растёт вместе с блайндами (~1/8 BB), чтобы вымывать фишки при упоре лестницы в потолок', () => {
    const schedule = buildBlindSchedule(20, 12);
    schedule.forEach((lvl, i) => {
      expect(lvl.ante).toBeGreaterThan(0);
      expect(lvl.ante).toBe(Math.max(1, Math.round(lvl.bigBlind / 8)));
      if (i > 0) expect(lvl.ante).toBeGreaterThanOrEqual(schedule[i - 1].ante);
    });
  });

  it('currentLevelForElapsed возвращает уровень по прошедшему времени', () => {
    const schedule = buildBlindSchedule(20, 12); // durationMin=12 → 720000ms за уровень
    expect(currentLevelForElapsed(schedule, 0).level).toBe(1);
    expect(currentLevelForElapsed(schedule, 720_000).level).toBe(2);
    expect(currentLevelForElapsed(schedule, 720_000 * 2 + 1).level).toBe(3);
  });

  it('currentLevelForElapsed держит последний уровень после конца расписания', () => {
    const schedule = buildBlindSchedule(20, 3);
    const totalMs = schedule.reduce((acc, l) => acc + l.durationMin * 60_000, 0);
    expect(currentLevelForElapsed(schedule, totalMs + 999_999).level).toBe(schedule.length);
  });

  it('msUntilNextLevel считает остаток до следующего уровня, Infinity на последнем', () => {
    const schedule = buildBlindSchedule(20, 12);
    expect(msUntilNextLevel(schedule, 0)).toBe(720_000);
    const totalMs = schedule.reduce((acc, l) => acc + l.durationMin * 60_000, 0);
    expect(msUntilNextLevel(schedule, totalMs + 1)).toBe(Infinity);
  });

  it('nextLevelBigBlind — BB следующего уровня (HUD под общими картами), undefined на последнем', () => {
    const schedule = buildBlindSchedule(20, 12); // 10/20 → 15/30 → 25/50 → ...
    expect(nextLevelBigBlind(schedule, 0)).toBe(30); // сейчас 10/20, дальше 15/30
    expect(nextLevelBigBlind(schedule, 720_000)).toBe(50); // сейчас 15/30, дальше 25/50
    const totalMs = schedule.reduce((acc, l) => acc + l.durationMin * 60_000, 0);
    expect(nextLevelBigBlind(schedule, totalMs + 999_999)).toBeUndefined(); // лестница кончилась
  });
});
