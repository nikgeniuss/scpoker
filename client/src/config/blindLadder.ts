// Стандартная лестница блайндов для слайдера в модалке создания стола (ROADMAP §10.6).
// Суммы в центах, как везде на клиенте (formatMoney делит на 100).
// Зачем лестница, а не свободный слайдер: блайнды идут привычными ступенями, а «0.07/0.13»
// не встречается ни в одном руме. Числовые поля рядом остаются — там можно задать что угодно,
// слайдер лишь быстро попадает в типовые ставки.
export interface BlindStep {
  sb: number;
  bb: number;
}

export const BLIND_LADDER: BlindStep[] = [
  { sb: 1, bb: 2 },
  { sb: 2, bb: 5 },
  { sb: 5, bb: 10 },
  { sb: 10, bb: 20 },
  { sb: 25, bb: 50 },
  { sb: 50, bb: 100 },
  { sb: 100, bb: 200 },
  { sb: 250, bb: 500 },
  { sb: 500, bb: 1000 },
  { sb: 1000, bb: 2000 },
  { sb: 2500, bb: 5000 },
];

// Точное совпадение со ступенью, иначе -1 (значение задано вручную в полях).
export function ladderIndexFor(sb: number, bb: number): number {
  return BLIND_LADDER.findIndex((s) => s.sb === sb && s.bb === bb);
}

// Ближайшая ступень по большому блайнду — нужна, чтобы у слайдера была позиция даже при
// произвольных значениях из полей. При равном расстоянии берём меньшую ступень.
export function nearestLadderIndex(bb: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < BLIND_LADDER.length; i++) {
    const dist = Math.abs(BLIND_LADDER[i].bb - bb);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

// Позиция ручки слайдера: точная ступень, иначе ближайшая.
export function sliderIndexFor(sb: number, bb: number): number {
  const exact = ladderIndexFor(sb, bb);
  return exact >= 0 ? exact : nearestLadderIndex(bb);
}

export function stepAt(index: number): BlindStep {
  const i = Math.max(0, Math.min(BLIND_LADDER.length - 1, Math.round(index)));
  return BLIND_LADDER[i];
}
