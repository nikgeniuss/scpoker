import type { BlindLevel } from '@poker-room/shared';

// Стандартная лестница блайндов (как в большинстве турнирных румов) — фиксированный список
// «круглых» пар (не формула), растёт до конца. Клиент (CreateTournamentModal.tsx) дублирует эти
// же пары для степпера выбора стартового уровня — держать в синхроне при правке.
export const BLIND_LADDER: ReadonlyArray<readonly [number, number]> = [
  [10, 20], [15, 30], [25, 50], [50, 100], [75, 150], [100, 200], [150, 300],
  [200, 400], [300, 600], [400, 800], [500, 1000], [600, 1200], [800, 1600],
  [1000, 2000], [1500, 3000], [2000, 4000], [3000, 6000], [4000, 8000],
  [5000, 10000], [6000, 12000], [8000, 16000], [10000, 20000],
];

// Строит полное расписание уровней для турнира начиная со стартового большого блайнда (админ
// выбирает его явно при создании турнира — степпер по BLIND_LADDER, см. CreateTournamentModal.tsx);
// длительность каждого уровня — levelUpMinutes. Если startingBigBlind не совпадает ни с одной
// парой лестницы (напр. старый вызов с производным значением) — стартует с ближайшей НЕ НИЖЕ.
// Анте (2026-07-03): классическое анте с каждого игрока, растёт вместе с блайндами (1/8 BB) —
// постепенно вымывает фишки из игры, даже когда лестница блайндов упирается в потолок (см. §0/POKER_RULES §6.7).
export function buildBlindSchedule(startingBigBlind: number, levelUpMinutes: number): BlindLevel[] {
  const durationMin = levelUpMinutes;
  let startIdx = BLIND_LADDER.findIndex(([, bb]) => bb >= startingBigBlind);
  if (startIdx < 0) startIdx = BLIND_LADDER.length - 1;
  const levels: BlindLevel[] = [];
  for (let i = startIdx; i < BLIND_LADDER.length; i++) {
    const [smallBlind, bigBlind] = BLIND_LADDER[i];
    const ante = Math.max(1, Math.round(bigBlind / 8));
    levels.push({ level: levels.length + 1, smallBlind, bigBlind, ante, durationMin });
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

// Большой блайнд СЛЕДУЮЩЕГО уровня (для HUD «через сколько вырастут блайнды и на сколько») —
// undefined, если текущий уровень уже последний в лестнице (роста больше не будет).
export function nextLevelBigBlind(schedule: BlindLevel[], elapsedMs: number): number | undefined {
  const cur = currentLevelForElapsed(schedule, elapsedMs);
  return schedule[cur.level]?.bigBlind; // cur.level 1-индексирован → schedule[level] это следующий элемент
}
