// Генератор векторных покерных фишек (вид сверху) для SK Poker.
// Запуск: node scripts/generate-chips.mjs
//
// Один в один по референсу (фишки.webp): плоский диск, белые «вырезы»-окна по краю,
// пунктирное внутреннее кольцо, лёгкий объём (3D-рант снизу + блик/тень).
// ЦЕНТР ПУСТОЙ — номинал дорисовывается в игре динамически (под номинал/стол).
//
// 11 цветов = 11 номиналов лестницы 0.01..25000 (см. client/src/config/chipDenoms.ts),
// чтобы можно было собрать ЛЮБОЙ банк. У светлых фишек (white/gold) вырезы/пунктир тёмные
// (иначе белое на белом не видно).
//
// Выход: client/public/chips/chip-<name>.svg + scripts/preview-chips.html.

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'client', 'public', 'chips');

// base — основной цвет, light — блик (верх), dark — 3D-рант (низ/край), spot — цвет вырезов/пунктира.
const PALETTE = [
  { name: 'white', base: '#e8eaef', light: '#ffffff', dark: '#bfc3cc', spot: '#23489e' },
  { name: 'pink', base: '#ec4f97', light: '#ff84bf', dark: '#bb2f70', spot: '#ffffff' },
  { name: 'cyan', base: '#15bcc6', light: '#59dfe6', dark: '#0d8b91', spot: '#ffffff' },
  { name: 'blue', base: '#2399e6', light: '#5fc0f3', dark: '#14709c', spot: '#ffffff' },
  { name: 'red', base: '#de1a11', light: '#f24a40', dark: '#9c0c07', spot: '#ffffff' },
  { name: 'green', base: '#25a826', light: '#54cc50', dark: '#13751a', spot: '#ffffff' },
  { name: 'black', base: '#2a2f38', light: '#474d59', dark: '#12151a', spot: '#ffffff' },
  { name: 'purple', base: '#aa1bc0', light: '#c64ad6', dark: '#6f0d82', spot: '#ffffff' },
  { name: 'orange', base: '#ec6a0e', light: '#ff9038', dark: '#b94e04', spot: '#ffffff' },
  { name: 'gold', base: '#f3d017', light: '#ffe65c', dark: '#c9a700', spot: '#ffffff' },
  { name: 'brown', base: '#7a3326', light: '#a04d3c', dark: '#56221a', spot: '#ffffff' },
];

const SPOTS = 8;
const SPOT_START = 0; // 8 вырезов равномерно

const C = 60;
const R_BODY = 52;
const EDGE_OFFSET = 7; // боковая «толщина» фишки (3D)
const R_INNER = 35;
const R_DASH = 31;
const R_CENTER = 24;

const SPOT_W = 18;
const SPOT_R_OUTER = 51;
const SPOT_R_INNER = 37;

function edgeSpots(spot) {
  const x = C - SPOT_W / 2;
  const y = C - SPOT_R_OUTER;
  const h = SPOT_R_OUTER - SPOT_R_INNER;
  let out = '';
  for (let i = 0; i < SPOTS; i++) {
    const a = SPOT_START + (360 / SPOTS) * i;
    out += `<g transform="rotate(${a} ${C} ${C})"><rect x="${x}" y="${y}" width="${SPOT_W}" height="${h}" rx="4.5" fill="${spot}"/></g>`;
  }
  return out;
}

function chipSVG({ name, base, light, dark, spot }) {
  const gb = `body-${name}`;
  const gc = `center-${name}`;
  const sh = `shadow-${name}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 122" width="120" height="122">
  <defs>
    <radialGradient id="${gb}" cx="50%" cy="40%" r="62%">
      <stop offset="0%" stop-color="${light}"/>
      <stop offset="62%" stop-color="${base}"/>
      <stop offset="100%" stop-color="${base}"/>
    </radialGradient>
    <radialGradient id="${gc}" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="${light}"/>
      <stop offset="100%" stop-color="${base}"/>
    </radialGradient>
    <filter id="${sh}" x="-25%" y="-25%" width="150%" height="160%">
      <feDropShadow dx="0" dy="2.5" stdDeviation="2.2" flood-color="#000000" flood-opacity="0.40"/>
    </filter>
  </defs>
  <circle cx="${C}" cy="${C + EDGE_OFFSET}" r="${R_BODY}" fill="${dark}" filter="url(#${sh})"/>
  <circle cx="${C}" cy="${C}" r="${R_BODY}" fill="url(#${gb})"/>
  ${edgeSpots(spot)}
  <circle cx="${C}" cy="${C}" r="${R_INNER}" fill="url(#${gc})"/>
  <circle cx="${C}" cy="${C}" r="${R_DASH}" fill="none" stroke="${spot}" stroke-opacity="0.9" stroke-width="1" stroke-dasharray="3 3" stroke-linecap="round"/>
  <circle cx="${C}" cy="${C}" r="${R_CENTER}" fill="${base}"/>
  <circle cx="${C}" cy="${C}" r="${R_CENTER}" fill="none" stroke="${dark}" stroke-opacity="0.5" stroke-width="1.2"/>
</svg>`;
}

mkdirSync(OUT_DIR, { recursive: true });

const previews = [];
for (const p of PALETTE) {
  const svg = chipSVG(p);
  writeFileSync(join(OUT_DIR, `chip-${p.name}.svg`), svg, 'utf8');
  previews.push(`<div class="cell"><div class="chip">${svg}</div><span>${p.name}</span></div>`);
}

const previewHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;background:#ffffff;font-family:Arial,sans-serif;color:#444}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;padding:28px;max-width:680px;margin:0 auto}
  .cell{display:flex;flex-direction:column;align-items:center;gap:6px}
  .chip{width:120px;height:122px}
  .chip svg{width:100%;height:100%}
  span{color:#888;font-size:12px}
</style></head><body><div class="grid">${previews.join('')}</div></body></html>`;
writeFileSync(join(__dirname, 'preview-chips.html'), previewHtml, 'utf8');

console.log(`Сгенерировано ${PALETTE.length} фишек → ${OUT_DIR}`);
