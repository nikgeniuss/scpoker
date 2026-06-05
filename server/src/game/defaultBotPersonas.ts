import type { BotPersona } from './botBrain.js';

// Дефолтный пул из 12 ботов (микс TAG/LAG/passive/maniac + 8 zero / 2 plus / 2 minus).
// Вынесено из BotManager.seedDefaultPool (ROADMAP §9.3-D) — seed-данные отдельно от логики.
// Срабатывает только при пустом bots.json (не перезаписывает существующих).
export interface DefaultBotSeed {
  name: string;
  chips: number;
  target: 'zero' | 'plus' | 'minus';
  persona: BotPersona;
}

export const DEFAULT_BOT_PERSONAS: DefaultBotSeed[] = [
  { name: 'Alex88',   chips: 5000, target: 'zero',  persona: { aggression: 0.50, bluffRate: 0.08, heroFoldRate: 0.06, slowplayRate: 0.12, vpip: 0.28, reactionFast: [900, 2200],  reactionSlow: [3500, 6500], fastBias: 0.65 } },
  { name: 'Pavel_R',  chips: 5000, target: 'plus',  persona: { aggression: 0.42, bluffRate: 0.05, heroFoldRate: 0.10, slowplayRate: 0.18, vpip: 0.22, reactionFast: [1100, 2500], reactionSlow: [4000, 7000], fastBias: 0.55 } },
  { name: 'Vovan',    chips: 5000, target: 'zero',  persona: { aggression: 0.55, bluffRate: 0.12, heroFoldRate: 0.05, slowplayRate: 0.10, vpip: 0.32, reactionFast: [800, 1800],  reactionSlow: [3000, 5500], fastBias: 0.70 } },
  { name: 'Tania',    chips: 5000, target: 'minus', persona: { aggression: 0.38, bluffRate: 0.04, heroFoldRate: 0.14, slowplayRate: 0.08, vpip: 0.20, reactionFast: [1200, 2800], reactionSlow: [4500, 7500], fastBias: 0.50 } },
  { name: 'RedFox',   chips: 5000, target: 'zero',  persona: { aggression: 0.62, bluffRate: 0.15, heroFoldRate: 0.04, slowplayRate: 0.08, vpip: 0.36, reactionFast: [700, 1700],  reactionSlow: [2800, 5200], fastBias: 0.75 } },
  { name: 'AnnaG',    chips: 5000, target: 'zero',  persona: { aggression: 0.40, bluffRate: 0.05, heroFoldRate: 0.12, slowplayRate: 0.16, vpip: 0.24, reactionFast: [1000, 2400], reactionSlow: [3800, 6800], fastBias: 0.58 } },
  { name: 'Max77',    chips: 5000, target: 'zero',  persona: { aggression: 0.48, bluffRate: 0.10, heroFoldRate: 0.07, slowplayRate: 0.20, vpip: 0.30, reactionFast: [950, 2100],  reactionSlow: [3600, 6200], fastBias: 0.62 } },
  { name: 'Kira_',    chips: 5000, target: 'plus',  persona: { aggression: 0.45, bluffRate: 0.06, heroFoldRate: 0.09, slowplayRate: 0.14, vpip: 0.26, reactionFast: [1050, 2300], reactionSlow: [3900, 6500], fastBias: 0.60 } },
  { name: 'Nataly',   chips: 5000, target: 'zero',  persona: { aggression: 0.36, bluffRate: 0.03, heroFoldRate: 0.16, slowplayRate: 0.06, vpip: 0.18, reactionFast: [1300, 3000], reactionSlow: [4800, 8000], fastBias: 0.45 } },
  { name: 'SergG',    chips: 5000, target: 'zero',  persona: { aggression: 0.58, bluffRate: 0.13, heroFoldRate: 0.05, slowplayRate: 0.09, vpip: 0.34, reactionFast: [850, 1900],  reactionSlow: [3100, 5800], fastBias: 0.68 } },
  { name: 'Igor_K',   chips: 5000, target: 'minus', persona: { aggression: 0.52, bluffRate: 0.11, heroFoldRate: 0.06, slowplayRate: 0.11, vpip: 0.31, reactionFast: [900, 2000],  reactionSlow: [3400, 6000], fastBias: 0.66 } },
  { name: 'Olga_M',   chips: 5000, target: 'zero',  persona: { aggression: 0.44, bluffRate: 0.07, heroFoldRate: 0.10, slowplayRate: 0.15, vpip: 0.25, reactionFast: [1000, 2300], reactionSlow: [3700, 6400], fastBias: 0.59 } },
];
