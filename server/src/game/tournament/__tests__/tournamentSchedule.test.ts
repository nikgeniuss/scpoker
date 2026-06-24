import { describe, it, expect } from 'vitest';
import { buildBlindSchedule, currentLevelForElapsed, msUntilNextLevel } from '../tournamentSchedule.js';

describe('tournamentSchedule — генерация уровней блайндов', () => {
  it('стартует около 75bb от стартового стека', () => {
    const schedule = buildBlindSchedule(1500, 'regular');
    expect(schedule[0].bigBlind).toBeLessThanOrEqual(30);
    expect(1500 / schedule[0].bigBlind).toBeGreaterThanOrEqual(50);
  });

  it('уровни монотонно растут и пронумерованы с 1', () => {
    const schedule = buildBlindSchedule(3000, 'turbo');
    schedule.forEach((lvl, i) => {
      expect(lvl.level).toBe(i + 1);
      if (i > 0) {
        expect(lvl.bigBlind).toBeGreaterThan(schedule[i - 1].bigBlind);
        expect(lvl.smallBlind).toBeGreaterThan(schedule[i - 1].smallBlind);
      }
    });
  });

  it('durationMin зависит от скорости', () => {
    const slow = buildBlindSchedule(1500, 'slow');
    const hyper = buildBlindSchedule(1500, 'hyper');
    expect(slow[0].durationMin).toBe(20);
    expect(hyper[0].durationMin).toBe(3);
  });

  it('анте не вводим в v1', () => {
    const schedule = buildBlindSchedule(1500, 'regular');
    schedule.forEach(lvl => expect(lvl.ante).toBe(0));
  });

  it('currentLevelForElapsed возвращает уровень по прошедшему времени', () => {
    const schedule = buildBlindSchedule(1500, 'regular'); // durationMin=12 → 720000ms за уровень
    expect(currentLevelForElapsed(schedule, 0).level).toBe(1);
    expect(currentLevelForElapsed(schedule, 720_000).level).toBe(2);
    expect(currentLevelForElapsed(schedule, 720_000 * 2 + 1).level).toBe(3);
  });

  it('currentLevelForElapsed держит последний уровень после конца расписания', () => {
    const schedule = buildBlindSchedule(1500, 'hyper');
    const totalMs = schedule.reduce((acc, l) => acc + l.durationMin * 60_000, 0);
    expect(currentLevelForElapsed(schedule, totalMs + 999_999).level).toBe(schedule.length);
  });

  it('msUntilNextLevel считает остаток до следующего уровня, Infinity на последнем', () => {
    const schedule = buildBlindSchedule(1500, 'regular');
    expect(msUntilNextLevel(schedule, 0)).toBe(720_000);
    const totalMs = schedule.reduce((acc, l) => acc + l.durationMin * 60_000, 0);
    expect(msUntilNextLevel(schedule, totalMs + 1)).toBe(Infinity);
  });
});
