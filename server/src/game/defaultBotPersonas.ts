import type { BotPersona } from './botBrain.js';

// Дефолтный пул из 50 ботов: TAG/LAG/Nit/Fish/Maniac/Balanced.
// Вынесено из BotManager.seedDefaultPool (ROADMAP §9.3-D).
// Срабатывает при пустом bots.json; новые персоны вливаются через mergeNewPersonas.
export interface DefaultBotSeed {
  name: string;
  chips: number;
  target: 'zero' | 'plus' | 'minus';
  persona: BotPersona;
}

export const DEFAULT_BOT_PERSONAS: DefaultBotSeed[] = [
  // ─── TAG (Tight-Aggressive, 15) ───────────────────────────────────────────
  { name: 'Alex88',   chips: 5000, target: 'zero',  persona: { aggression: 0.50, bluffRate: 0.08, heroFoldRate: 0.06, slowplayRate: 0.12, vpip: 0.28, reactionFast: [900, 2200],  reactionSlow: [3500, 6500], fastBias: 0.65 } },
  { name: 'Vovan',    chips: 5000, target: 'zero',  persona: { aggression: 0.55, bluffRate: 0.12, heroFoldRate: 0.05, slowplayRate: 0.10, vpip: 0.32, reactionFast: [800, 1800],  reactionSlow: [3000, 5500], fastBias: 0.70 } },
  { name: 'RedFox',   chips: 5000, target: 'zero',  persona: { aggression: 0.62, bluffRate: 0.15, heroFoldRate: 0.04, slowplayRate: 0.08, vpip: 0.36, reactionFast: [700, 1700],  reactionSlow: [2800, 5200], fastBias: 0.75 } },
  { name: 'SergG',    chips: 5000, target: 'zero',  persona: { aggression: 0.58, bluffRate: 0.13, heroFoldRate: 0.05, slowplayRate: 0.09, vpip: 0.34, reactionFast: [850, 1900],  reactionSlow: [3100, 5800], fastBias: 0.68 } },
  { name: 'Max77',    chips: 5000, target: 'zero',  persona: { aggression: 0.48, bluffRate: 0.10, heroFoldRate: 0.07, slowplayRate: 0.20, vpip: 0.30, reactionFast: [950, 2100],  reactionSlow: [3600, 6200], fastBias: 0.62 } },
  { name: 'Igor_K',   chips: 5000, target: 'zero',  persona: { aggression: 0.52, bluffRate: 0.11, heroFoldRate: 0.06, slowplayRate: 0.11, vpip: 0.31, reactionFast: [900, 2000],  reactionSlow: [3400, 6000], fastBias: 0.66 } },
  { name: 'DimaN',    chips: 5000, target: 'zero',  persona: { aggression: 0.53, bluffRate: 0.09, heroFoldRate: 0.08, slowplayRate: 0.13, vpip: 0.29, reactionFast: [870, 2050],  reactionSlow: [3300, 5900], fastBias: 0.64 } },
  { name: 'RuslanK',  chips: 5000, target: 'zero',  persona: { aggression: 0.60, bluffRate: 0.11, heroFoldRate: 0.06, slowplayRate: 0.10, vpip: 0.33, reactionFast: [780, 1850],  reactionSlow: [2900, 5400], fastBias: 0.72 } },
  { name: 'ArtemS',   chips: 5000, target: 'plus',  persona: { aggression: 0.56, bluffRate: 0.10, heroFoldRate: 0.07, slowplayRate: 0.14, vpip: 0.27, reactionFast: [920, 2100],  reactionSlow: [3400, 6100], fastBias: 0.63 } },
  { name: 'VladP',    chips: 5000, target: 'zero',  persona: { aggression: 0.47, bluffRate: 0.08, heroFoldRate: 0.09, slowplayRate: 0.16, vpip: 0.25, reactionFast: [1000, 2200], reactionSlow: [3700, 6400], fastBias: 0.60 } },
  { name: 'AndreiG',  chips: 5000, target: 'plus',  persona: { aggression: 0.64, bluffRate: 0.12, heroFoldRate: 0.05, slowplayRate: 0.09, vpip: 0.35, reactionFast: [750, 1750],  reactionSlow: [2850, 5300], fastBias: 0.74 } },
  { name: 'FedorT',   chips: 5000, target: 'zero',  persona: { aggression: 0.46, bluffRate: 0.07, heroFoldRate: 0.10, slowplayRate: 0.17, vpip: 0.26, reactionFast: [960, 2150],  reactionSlow: [3550, 6300], fastBias: 0.61 } },
  { name: 'StasV',    chips: 5000, target: 'zero',  persona: { aggression: 0.59, bluffRate: 0.14, heroFoldRate: 0.04, slowplayRate: 0.08, vpip: 0.34, reactionFast: [820, 1950],  reactionSlow: [3050, 5700], fastBias: 0.69 } },
  { name: 'DenisK',   chips: 5000, target: 'zero',  persona: { aggression: 0.51, bluffRate: 0.09, heroFoldRate: 0.08, slowplayRate: 0.12, vpip: 0.30, reactionFast: [890, 2080],  reactionSlow: [3350, 6050], fastBias: 0.63 } },
  { name: 'KostiaB',  chips: 5000, target: 'zero',  persona: { aggression: 0.45, bluffRate: 0.07, heroFoldRate: 0.11, slowplayRate: 0.18, vpip: 0.23, reactionFast: [1050, 2300], reactionSlow: [3800, 6600], fastBias: 0.57 } },

  // ─── LAG (Loose-Aggressive, 10) ───────────────────────────────────────────
  { name: 'BorisFire', chips: 5000, target: 'zero',  persona: { aggression: 0.72, bluffRate: 0.18, heroFoldRate: 0.03, slowplayRate: 0.07, vpip: 0.45, reactionFast: [650, 1500],  reactionSlow: [2600, 5000], fastBias: 0.80 } },
  { name: 'VanyaMax',  chips: 5000, target: 'zero',  persona: { aggression: 0.78, bluffRate: 0.22, heroFoldRate: 0.03, slowplayRate: 0.05, vpip: 0.50, reactionFast: [580, 1350],  reactionSlow: [2300, 4600], fastBias: 0.84 } },
  { name: 'NikolayB',  chips: 5000, target: 'zero',  persona: { aggression: 0.65, bluffRate: 0.14, heroFoldRate: 0.04, slowplayRate: 0.09, vpip: 0.40, reactionFast: [720, 1650],  reactionSlow: [2800, 5200], fastBias: 0.76 } },
  { name: 'SashaG',    chips: 5000, target: 'plus',  persona: { aggression: 0.68, bluffRate: 0.16, heroFoldRate: 0.05, slowplayRate: 0.08, vpip: 0.38, reactionFast: [690, 1600],  reactionSlow: [2700, 5100], fastBias: 0.78 } },
  { name: 'MishaD',    chips: 5000, target: 'zero',  persona: { aggression: 0.74, bluffRate: 0.20, heroFoldRate: 0.03, slowplayRate: 0.06, vpip: 0.48, reactionFast: [620, 1420],  reactionSlow: [2450, 4800], fastBias: 0.82 } },
  { name: 'AntonR',    chips: 5000, target: 'plus',  persona: { aggression: 0.66, bluffRate: 0.15, heroFoldRate: 0.05, slowplayRate: 0.10, vpip: 0.42, reactionFast: [700, 1620],  reactionSlow: [2750, 5150], fastBias: 0.77 } },
  { name: 'GenadiyK',  chips: 5000, target: 'zero',  persona: { aggression: 0.70, bluffRate: 0.17, heroFoldRate: 0.04, slowplayRate: 0.07, vpip: 0.44, reactionFast: [660, 1550],  reactionSlow: [2650, 5050], fastBias: 0.79 } },
  { name: 'TikhonV',   chips: 5000, target: 'zero',  persona: { aggression: 0.76, bluffRate: 0.21, heroFoldRate: 0.03, slowplayRate: 0.05, vpip: 0.52, reactionFast: [600, 1380],  reactionSlow: [2400, 4700], fastBias: 0.83 } },
  { name: 'YuriPro',   chips: 5000, target: 'zero',  persona: { aggression: 0.63, bluffRate: 0.13, heroFoldRate: 0.05, slowplayRate: 0.11, vpip: 0.37, reactionFast: [730, 1680],  reactionSlow: [2820, 5220], fastBias: 0.75 } },
  { name: 'GlebT',     chips: 5000, target: 'plus',  persona: { aggression: 0.69, bluffRate: 0.16, heroFoldRate: 0.04, slowplayRate: 0.08, vpip: 0.43, reactionFast: [680, 1580],  reactionSlow: [2700, 5100], fastBias: 0.78 } },

  // ─── Nit (Tight-Passive, 8) ───────────────────────────────────────────────
  { name: 'Pavel_R',  chips: 5000, target: 'plus',  persona: { aggression: 0.42, bluffRate: 0.05, heroFoldRate: 0.10, slowplayRate: 0.18, vpip: 0.22, reactionFast: [1100, 2500], reactionSlow: [4000, 7000], fastBias: 0.55 } },
  { name: 'AnnaG',    chips: 5000, target: 'zero',  persona: { aggression: 0.40, bluffRate: 0.05, heroFoldRate: 0.12, slowplayRate: 0.16, vpip: 0.24, reactionFast: [1000, 2400], reactionSlow: [3800, 6800], fastBias: 0.58 } },
  { name: 'Nataly',   chips: 5000, target: 'zero',  persona: { aggression: 0.36, bluffRate: 0.03, heroFoldRate: 0.16, slowplayRate: 0.06, vpip: 0.18, reactionFast: [1300, 3000], reactionSlow: [4800, 8000], fastBias: 0.45 } },
  { name: 'GalyaM',   chips: 5000, target: 'zero',  persona: { aggression: 0.28, bluffRate: 0.02, heroFoldRate: 0.20, slowplayRate: 0.05, vpip: 0.15, reactionFast: [1400, 3200], reactionSlow: [5000, 8500], fastBias: 0.40 } },
  { name: 'LidiyaK',  chips: 5000, target: 'zero',  persona: { aggression: 0.32, bluffRate: 0.03, heroFoldRate: 0.18, slowplayRate: 0.07, vpip: 0.17, reactionFast: [1250, 2900], reactionSlow: [4600, 7800], fastBias: 0.43 } },
  { name: 'NadezdaN', chips: 5000, target: 'zero',  persona: { aggression: 0.30, bluffRate: 0.02, heroFoldRate: 0.19, slowplayRate: 0.06, vpip: 0.14, reactionFast: [1350, 3100], reactionSlow: [4900, 8300], fastBias: 0.41 } },
  { name: 'AlexeiP',  chips: 5000, target: 'plus',  persona: { aggression: 0.35, bluffRate: 0.04, heroFoldRate: 0.15, slowplayRate: 0.09, vpip: 0.20, reactionFast: [1150, 2700], reactionSlow: [4200, 7200], fastBias: 0.50 } },
  { name: 'PolinaN',  chips: 5000, target: 'zero',  persona: { aggression: 0.34, bluffRate: 0.03, heroFoldRate: 0.17, slowplayRate: 0.07, vpip: 0.16, reactionFast: [1200, 2800], reactionSlow: [4400, 7500], fastBias: 0.47 } },

  // ─── Fish (Loose-Passive, 8) ──────────────────────────────────────────────
  { name: 'Tania',    chips: 5000, target: 'zero',  persona: { aggression: 0.38, bluffRate: 0.04, heroFoldRate: 0.14, slowplayRate: 0.08, vpip: 0.20, reactionFast: [1200, 2800], reactionSlow: [4500, 7500], fastBias: 0.50 } },
  { name: 'Kira_',    chips: 5000, target: 'plus',  persona: { aggression: 0.45, bluffRate: 0.06, heroFoldRate: 0.09, slowplayRate: 0.14, vpip: 0.26, reactionFast: [1050, 2300], reactionSlow: [3900, 6500], fastBias: 0.60 } },
  { name: 'Olga_M',   chips: 5000, target: 'zero',  persona: { aggression: 0.44, bluffRate: 0.07, heroFoldRate: 0.10, slowplayRate: 0.15, vpip: 0.25, reactionFast: [1000, 2300], reactionSlow: [3700, 6400], fastBias: 0.59 } },
  { name: 'SvetaB',   chips: 5000, target: 'zero',  persona: { aggression: 0.32, bluffRate: 0.04, heroFoldRate: 0.06, slowplayRate: 0.14, vpip: 0.48, reactionFast: [1100, 2600], reactionSlow: [4000, 6800], fastBias: 0.52 } },
  { name: 'AlyonaK',  chips: 5000, target: 'zero',  persona: { aggression: 0.35, bluffRate: 0.05, heroFoldRate: 0.08, slowplayRate: 0.12, vpip: 0.45, reactionFast: [1050, 2450], reactionSlow: [3800, 6600], fastBias: 0.54 } },
  { name: 'MarinaN',  chips: 5000, target: 'zero',  persona: { aggression: 0.30, bluffRate: 0.03, heroFoldRate: 0.07, slowplayRate: 0.16, vpip: 0.52, reactionFast: [1150, 2700], reactionSlow: [4200, 7100], fastBias: 0.50 } },
  { name: 'ZoyaB',    chips: 5000, target: 'zero',  persona: { aggression: 0.34, bluffRate: 0.04, heroFoldRate: 0.05, slowplayRate: 0.10, vpip: 0.55, reactionFast: [1000, 2400], reactionSlow: [3900, 6700], fastBias: 0.53 } },
  { name: 'RitaM',    chips: 5000, target: 'zero',  persona: { aggression: 0.36, bluffRate: 0.05, heroFoldRate: 0.07, slowplayRate: 0.13, vpip: 0.50, reactionFast: [1080, 2500], reactionSlow: [4000, 6900], fastBias: 0.51 } },

  // ─── Maniac (5) ───────────────────────────────────────────────────────────
  { name: 'BomberD',   chips: 5000, target: 'zero',  persona: { aggression: 0.85, bluffRate: 0.28, heroFoldRate: 0.02, slowplayRate: 0.04, vpip: 0.65, reactionFast: [500, 1100],  reactionSlow: [2000, 3800], fastBias: 0.88 } },
  { name: 'AllInM',    chips: 5000, target: 'zero',  persona: { aggression: 0.82, bluffRate: 0.25, heroFoldRate: 0.02, slowplayRate: 0.05, vpip: 0.60, reactionFast: [520, 1150],  reactionSlow: [2100, 4000], fastBias: 0.86 } },
  { name: 'KrazyG',    chips: 5000, target: 'zero',  persona: { aggression: 0.88, bluffRate: 0.32, heroFoldRate: 0.02, slowplayRate: 0.04, vpip: 0.70, reactionFast: [480, 1050],  reactionSlow: [1900, 3700], fastBias: 0.90 } },
  { name: 'RocketK',   chips: 5000, target: 'zero',  persona: { aggression: 0.80, bluffRate: 0.24, heroFoldRate: 0.03, slowplayRate: 0.06, vpip: 0.58, reactionFast: [540, 1200],  reactionSlow: [2150, 4100], fastBias: 0.85 } },
  { name: 'StormA',    chips: 5000, target: 'zero',  persona: { aggression: 0.86, bluffRate: 0.30, heroFoldRate: 0.02, slowplayRate: 0.05, vpip: 0.67, reactionFast: [510, 1120],  reactionSlow: [2050, 3900], fastBias: 0.87 } },

  // ─── Balanced / GTO-ish (4) ───────────────────────────────────────────────
  { name: 'ProMax77',  chips: 5000, target: 'plus',  persona: { aggression: 0.55, bluffRate: 0.10, heroFoldRate: 0.09, slowplayRate: 0.14, vpip: 0.28, reactionFast: [950, 2150],  reactionSlow: [3500, 6300], fastBias: 0.64 } },
  { name: 'GTO_Dima',  chips: 5000, target: 'zero',  persona: { aggression: 0.52, bluffRate: 0.09, heroFoldRate: 0.10, slowplayRate: 0.15, vpip: 0.26, reactionFast: [980, 2200],  reactionSlow: [3600, 6500], fastBias: 0.62 } },
  { name: 'EquityN',   chips: 5000, target: 'plus',  persona: { aggression: 0.57, bluffRate: 0.11, heroFoldRate: 0.08, slowplayRate: 0.13, vpip: 0.30, reactionFast: [930, 2100],  reactionSlow: [3450, 6200], fastBias: 0.66 } },
  { name: 'TechA',     chips: 5000, target: 'zero',  persona: { aggression: 0.50, bluffRate: 0.08, heroFoldRate: 0.11, slowplayRate: 0.16, vpip: 0.24, reactionFast: [1010, 2250], reactionSlow: [3700, 6600], fastBias: 0.60 } },
];
