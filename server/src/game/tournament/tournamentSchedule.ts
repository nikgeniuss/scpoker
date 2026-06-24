import type { BlindLevel, BlindSpeed } from '@poker-room/shared';

// Стандартная лестница блайндов (как в большинстве турнирных румов) — относительные величины,
// масштаб не привязан к валюте: подбирается уровень, где bigBlind ≈ startingStack/75 (типичный
// старт SNG ~75bb), дальше лестница идёт вверх до конца. Анте в v1 не вводим (не запрошено — §1).
const BLIND_LADDER: ReadonlyArray<readonly [number, number]> = [
  [10, 20], [15, 30], [25, 50], [50, 100], [75, 150], [100, 200], [150, 300],
  [200, 400], [300, 600], [400, 800], [500, 1000], [600, 1200], [800, 1600],
  [1000, 2000], [1500, 3000], [2000, 4000], [3000, 6000], [4000, 8000],
  [5000, 10000], [6000, 12000], [8000, 16000], [10000, 20000],
];

const SPEED_DURATIONS: Record<BlindSpeed, number> = {
  slow: 20,
  regular: 12,
  turbo: 6,
  hyper: 3,
};

// Строит полное расписание уровней для турнира с данным стартовым стеком и скоростью.
export function buildBlindSchedule(startingStack: number, speed: BlindSpeed): BlindLevel[] {
  const durationMin = SPEED_DURATIONS[speed];
  const targetStartBb = Math.max(10, Math.round(startingStack / 75));
  let startIdx = BLIND_LADDER.findIndex(([, bb]) => bb >= targetStartBb);
  if (startIdx < 0) startIdx = BLIND_LADDER.length - 1;
  const levels: BlindLevel[] = [];
  for (let i = startIdx; i < BLIND_LADDER.length; i++) {
    const [smallBlind, bigBlind] = BLIND_LADDER[i];
    levels.push({ level: levels.length + 1, smallBlind, bigBlind, ante: 0, durationMin });
  }
  return levels;
}

// Уровень, действующий на момент elapsedMs от старта турнира. После конца расписания — держим
// последний уровень (турнир не должен «зависнуть» без блайндов, если затянулся дольше лестницы).
export function currentLevelForElapsed(schedule: BlindLevel[], elapsedMs: number): BlindLevel {
  let acc = 0;
  for (const lvl of schedule) {
    acc += lvl.durationMin * 60_000;
    if (elapsedMs < acc) return lvl;
  }
  return schedule[schedule.length - 1];
}

// Сколько мс осталось до следующего повышения уровня. Infinity — уже на последнем уровне лестницы.
export function msUntilNextLevel(schedule: BlindLevel[], elapsedMs: number): number {
  let acc = 0;
  for (const lvl of schedule) {
    acc += lvl.durationMin * 60_000;
    if (elapsedMs < acc) return acc - elapsedMs;
  }
  return Infinity;
}
