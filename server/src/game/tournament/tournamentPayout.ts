import type { PayoutTier, MttItmPercent, BountyType, TournamentEntryStatus } from '@poker-room/shared';

// Минимум полей записи участника, нужный для расчёта окончательных мест (чистая функция не знает
// про остальной TournamentEntry).
export interface FinalPlaceInput {
  userId: string;
  status: TournamentEntryStatus;
  eliminationOrder?: number;
}

// Следующий номер выхода из турнира. Монотонный счётчик, а НЕ Date.now(): несколько вылетов
// запросто приходятся на одну миллисекунду (разные столы, быстрые раздачи, тесты), и тогда порядок
// мест схлопывается. Считается от уже проставленных номеров, поэтому переживает рестарт сервера.
export function nextEliminationOrder(entries: readonly FinalPlaceInput[]): number {
  return entries.reduce((max, e) => Math.max(max, e.eliminationOrder ?? 0), 0) + 1;
}

// «Насколько долго запись продержалась в турнире»: ещё не выбывшая держится дольше любой выбывшей,
// среди выбывших — чем позже вылет, тем выше место.
function survivalRank(entry: FinalPlaceInput): number {
  return entry.status === 'eliminated' ? entry.eliminationOrder ?? 0 : Number.MAX_SAFE_INTEGER;
}

// Окончательные места по порядку вылета — вызывается один раз при finish(), когда играющих
// осталось не больше одного. Возвращает массив, параллельный входному: место для записи либо
// undefined, если запись места не занимает.
//
// Решает две реальные проблемы прежнего «место = сколько ещё играют на момент баста» (ROADMAP §9.2):
//   1. ре-энтри возвращают игроков в пул, поэтому счётчик не убывал строго — два РАЗНЫХ вылета
//      могли получить одинаковое место, и на призовом месте finish() платил полный приз обоим;
//   2. у игрока с ре-энтри несколько записей, и каждая могла получить свой приз.
// Здесь место присуждается ИГРОКУ (не записи) ровно один раз, по его ПОСЛЕДНЕМУ выходу из турнира,
// а места идут подряд 1..N без дыр и повторов.
export function computeFinalPlaces(entries: readonly FinalPlaceInput[]): Array<number | undefined> {
  // Последняя (самая «долгоживущая») запись каждого игрока — только она претендует на место.
  const lastIdxByUser = new Map<string, number>();
  entries.forEach((entry, idx) => {
    const prevIdx = lastIdxByUser.get(entry.userId);
    if (prevIdx === undefined || survivalRank(entry) >= survivalRank(entries[prevIdx])) {
      lastIdxByUser.set(entry.userId, idx);
    }
  });

  const finalists = [...lastIdxByUser.values()].sort(
    (a, b) => survivalRank(entries[b]) - survivalRank(entries[a]),
  );

  const places: Array<number | undefined> = entries.map(() => undefined);
  finalists.forEach((idx, i) => { places[idx] = i + 1; });
  return places;
}

// Стандартные SNG-сплиты по числу участников (как в реальных румах): чем меньше стол, тем меньше
// призовых мест. Точные % — общеотраслевой дефолт (50/30/20 для 6-9-max, top-2 для меньших).
// tableSize выбирает БЛИЖАЙШИЙ снизу диапазон (напр. 7 участников → таблица "6-9").
const SNG_PAYOUT_TABLES: ReadonlyArray<{ maxTableSize: number; tiers: PayoutTier[] }> = [
  { maxTableSize: 2, tiers: [{ place: 1, percent: 100 }] },
  { maxTableSize: 4, tiers: [{ place: 1, percent: 65 }, { place: 2, percent: 35 }] },
  { maxTableSize: 6, tiers: [{ place: 1, percent: 65 }, { place: 2, percent: 35 }] },
  { maxTableSize: 9, tiers: [{ place: 1, percent: 50 }, { place: 2, percent: 30 }, { place: 3, percent: 20 }] },
];

// Таблица призовых % мест по размеру стола. Не зависит от prizePool — чистая функция.
export function getSngPayoutTiers(tableSize: number): PayoutTier[] {
  const table = SNG_PAYOUT_TABLES.find(t => tableSize <= t.maxTableSize) ?? SNG_PAYOUT_TABLES[SNG_PAYOUT_TABLES.length - 1];
  return table.tiers;
}

// Призовые фишки по местам для конкретного prizePool. Округление вниз, остаток (от округления)
// уходит победителю (1-е место) — без потери фишек в системе.
export function computeSngPayout(prizePool: number, tableSize: number): Record<number, number> {
  const tiers = getSngPayoutTiers(tableSize);
  const result: Record<number, number> = {};
  let distributed = 0;
  tiers.forEach(t => {
    const amount = Math.floor((prizePool * t.percent) / 100);
    result[t.place] = amount;
    distributed += amount;
  });
  const remainder = prizePool - distributed;
  if (remainder > 0 && tiers.length > 0) {
    result[1] = (result[1] ?? 0) + remainder;
  }
  return result;
}

// MTT: число призовых мест. fixedPlaces (если задан и >0) — строго это число мест, независимо
// от числа участников (capped числом участников — нельзя заплатить больше, чем людей в турнире).
// Иначе — преднастройка ITM% от общего числа участников. Минимум 1 место в любом случае.
function paidPlacesCount(totalEntries: number, itmPercent: MttItmPercent, fixedPlaces?: number): number {
  if (fixedPlaces && fixedPlaces > 0) {
    return Math.max(1, Math.min(fixedPlaces, totalEntries));
  }
  return Math.max(1, Math.round((totalEntries * itmPercent) / 100));
}

// MTT: убывающая ITM-кривая (вес места = 1/place^exponent, нормированный к 100%) — 1-е место
// получает заметно больше последнего призового места, без скачков. exponent=1 (дефолт) — гармонический
// ряд 1, 1/2, 1/3, ... (старое поведение); <1 — площе (flat), >1 — круче (top-heavy, больше 1-му месту).
// Чистая функция. fixedPlaces — см. paidPlacesCount (строгое число мест вместо доли от участников).
export function getMttPayoutTiers(
  totalEntries: number,
  itmPercent: MttItmPercent,
  fixedPlaces?: number,
  exponent = 1,
): PayoutTier[] {
  const paidPlaces = paidPlacesCount(totalEntries, itmPercent, fixedPlaces);
  const weights = Array.from({ length: paidPlaces }, (_, i) => 1 / Math.pow(i + 1, exponent));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w, i) => ({ place: i + 1, percent: (w / weightSum) * 100 }));
}

// Баунти/PKO: как делится «цена за голову» жертвы между кэшем убийце (в банкролл, сразу) и
// приростом СОБСТВЕННОГО баунти убийцы (для progressive — растёт по ходу турнира у выживших).
// 'flat' — всё кэшем сразу, ничего не растёт. Округление вниз, остаток уходит в кэш (без потерь).
export function computeBountySplit(bountyType: BountyType, bountyAmount: number): { cash: number; addToOwnBounty: number } {
  if (bountyType === 'progressive') {
    const addToOwnBounty = Math.floor(bountyAmount / 2);
    return { cash: bountyAmount - addToOwnBounty, addToOwnBounty };
  }
  return { cash: bountyAmount, addToOwnBounty: 0 };
}

// MTT-гарантия: сколько рум должен доплатить в prizePool, чтобы достичь guaranteedPrizePool, если
// бай-инов не хватило. 0 — гарантия не задана или уже выполнена собранными бай-инами. Чистая функция.
export function computeGuaranteeOverlay(prizePool: number, guaranteedPrizePool?: number): number {
  if (!guaranteedPrizePool || guaranteedPrizePool <= prizePool) return 0;
  return guaranteedPrizePool - prizePool;
}

// MTT: призовые фишки по местам. Округление вниз, остаток уходит победителю — без потери фишек.
export function computeMttPayout(
  prizePool: number,
  totalEntries: number,
  itmPercent: MttItmPercent,
  fixedPlaces?: number,
  exponent = 1,
): Record<number, number> {
  const tiers = getMttPayoutTiers(totalEntries, itmPercent, fixedPlaces, exponent);
  const result: Record<number, number> = {};
  let distributed = 0;
  tiers.forEach(t => {
    const amount = Math.floor((prizePool * t.percent) / 100);
    result[t.place] = amount;
    distributed += amount;
  });
  const remainder = prizePool - distributed;
  if (remainder > 0 && tiers.length > 0) {
    result[1] = (result[1] ?? 0) + remainder;
  }
  return result;
}
