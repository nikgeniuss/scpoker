import type { BotPersona } from './botBrain.js';
import { makeSeededRng } from './botBrain.js';

// Пул человеческих имён для незаметного заполнения турниров ботами (roadmap 2026-07-09).
// Отдельный пул от DEFAULT_BOT_PERSONAS (кэш-боты) — разные id-неймспейсы (см. BotManager
// FILLER_BOT_ID_PREFIX), разное назначение: эти боты не сидят в кэш-автостолах, только в турнирах,
// и всегда играют на слив (targetPnL='minus', см. BotManager.buildFillerPersona). ≥110 имён —
// чтобы в одном турнире с большим числом участников не было заметных повторов.
export const TOURNAMENT_FILLER_NAMES: string[] = [
  // Male
  'Timur91', 'Timur_B', 'Yarik74', 'Yarik_S', 'Bogdan63', 'Bogdan_M', 'Egor82', 'Egor_V',
  'Kirill45', 'Kirill_P', 'Zhenya67', 'Zhenya_K', 'Slava58', 'Slava_N', 'Grisha39', 'Grisha_T',
  'Vitalik72', 'Vitalik_R', 'Stepan84', 'Stepan_G', 'Semyon26', 'Semyon_K', 'Matvey93', 'Matvey_P',
  'Arseniy51', 'Arseniy_L', 'Miron47', 'Miron_D', 'Rodion38', 'Rodion_V', 'Taras66', 'Taras_K',
  'Filipp29', 'Filipp_N', 'Nazar83', 'Nazar_B', 'Savva14', 'Savva_G', 'Oleg57', 'Oleg_R',
  'Roman92', 'Roman_T', 'Viktor36', 'Viktor_M', 'Ilya78', 'Ilya_S', 'Nikita64', 'Nikita_V',
  'Damir41', 'Damir_K', 'Rinat59', 'Rinat_B', 'Artur73', 'Artur_M', 'Vadim28', 'Vadim_N',
  'Yegor85', 'Yegor_K', 'Arkady62', 'Arkady_N', 'Luka34', 'Luka_R', 'Timofey96', 'Timofey_B',
  'Zakhar17', 'Zakhar_T', 'Radion48', 'Radion_K', 'Vsevolod71', 'Vsevolod_M', 'Innokenty23', 'Innokenty_V',
  'Prokhor86', 'Prokhor_S', 'Foma42', 'Foma_K', 'Ermak69', 'Ermak_N', 'Orest31', 'Orest_B',
  // Female
  'Ksenia19', 'Ksenia_F', 'Diana75', 'Diana_H', 'Alina53', 'Alina_D', 'Yulia88', 'Yulia_C',
  'Ekaterina24', 'Ekaterina_W', 'Sonya61', 'Sonya_L', 'Vera37', 'Vera_J', 'Larisa49', 'Larisa_Q',
  'Zhanna77', 'Zhanna_R', 'Alisa15', 'Alisa_X', 'Milana94', 'Milana_Z', 'Vika32', 'Vika_E',
  'Karina68', 'Karina_A', 'Snezhana21', 'Snezhana_I', 'Yana54', 'Yana_O', 'Liza87', 'Liza_U',
  'Varya33', 'Varya_Y', 'Inna46', 'Inna_H', 'Nastya79', 'Nastya_G', 'Katya22', 'Katya_M',
  // Стилизованные хендлы (без цифр/суффиксов, для разнообразия внешнего вида ника)
  'Zvezda_', 'Volna_R', 'Legenda7', 'Kroshka_', 'Sudba7', 'Feniks_M', 'Iskra_V', 'Kompas7',
  'Puteshestvennik', 'Sever_K', 'Yugok_', 'Tayga_N', 'Reka_S', 'Gorec_D',
];

// Два архетипа «слабого игрока, который сливает стек» — заметно пассивнее и loose, чем
// TEST_BLEED_PERSONA (BotManager, ручной debug-инструмент «тестовых ботов»): выше vpip, ниже
// aggression/bluff — реже раздумывает, чаще платит и почти не блефует. Быстрая реакция
// (fastBias выше) — имитирует импульсивную игру не глубоко думающего игрока.
const FILLER_PERSONA_ARCHETYPES: BotPersona[] = [
  { aggression: 0.22, bluffRate: 0.02, heroFoldRate: 0.03, slowplayRate: 0.10, vpip: 0.62, reactionFast: [700, 1600], reactionSlow: [2200, 4200], fastBias: 0.72 },
  { aggression: 0.18, bluffRate: 0.01, heroFoldRate: 0.04, slowplayRate: 0.08, vpip: 0.58, reactionFast: [800, 1800], reactionSlow: [2500, 4600], fastBias: 0.68 },
];

// Насколько турнирные боты слабее своей базовой персоны (0.15 = «ещё на 15% слабее», запрос
// пользователя после живого прогона). Крутится ОДНОЙ цифрой и применяется и к заполнителям, и к
// тестовым ботам (BotManager) — оба типа играют только в турнирах.
// Слабее в этой модели = меньше агрессии, блефа и правильных хиро-фолдов, но БОЛЬШЕ vpip:
// бот заходит в большее число рук с мусором и чаще платит, вместо того чтобы давить.
export const TOURNAMENT_BOT_WEAKNESS = 0.15;

export function weakenPersona(base: BotPersona, weakness = TOURNAMENT_BOT_WEAKNESS): BotPersona {
  const down = (v: number) => Math.max(0, v * (1 - weakness));
  const up = (v: number) => Math.min(1, v * (1 + weakness));
  return {
    ...base,
    aggression: down(base.aggression),
    bluffRate: down(base.bluffRate),
    heroFoldRate: down(base.heroFoldRate),
    vpip: up(base.vpip),
  };
}

// Выбор архетипа + лёгкий детерминированный джиттер (±10%) по seed бота — чтобы 100+ ботов
// не были статистически идентичны друг другу поверх разных имён.
export function buildFillerPersona(seed: number): BotPersona {
  const rng = makeSeededRng(seed);
  const base = weakenPersona(FILLER_PERSONA_ARCHETYPES[Math.floor(rng() * FILLER_PERSONA_ARCHETYPES.length)]);
  const jitter = (v: number) => Math.max(0, Math.min(1, v * (0.9 + rng() * 0.2)));
  return {
    aggression: jitter(base.aggression),
    bluffRate: jitter(base.bluffRate),
    heroFoldRate: jitter(base.heroFoldRate),
    slowplayRate: jitter(base.slowplayRate),
    vpip: jitter(base.vpip),
    reactionFast: base.reactionFast,
    reactionSlow: base.reactionSlow,
    fastBias: jitter(base.fastBias),
  };
}
