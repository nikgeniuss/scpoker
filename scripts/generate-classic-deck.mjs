// Генератор простой классической SVG-колоды для SK Poker.
// Запуск: node scripts/generate-classic-deck.mjs
//
// Масти (♠ ♥ ♦ ♣) — SVG path, центры в (0,0). Размещаются через <use> с x/y =
// желаемые координаты центра — никаких baseline-проблем.
// Ранги (2..A, J, Q, K) — <text>. Для них вычитаем эмпирический offset чтобы текст
// центрировался на нужном y.

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'images', 'classic');

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS = {
  S: { color: '#1a1a1a', name: 'spades' },
  H: { color: '#c0282d', name: 'hearts' },
  D: { color: '#c0282d', name: 'diamonds' },
  C: { color: '#1a1a1a', name: 'clubs' },
};

const W = 200;
const H = 280;

// SVG-paths для мастей. Bounding box каждой ~90×85 — рендерятся визуально одинакового размера.
// Размер задаётся через scale при <use>: size 36px → scale = 36/90 = 0.4.
// Clubs — три круглых листа + стебель (раньше был слишком вытянут по вертикали).
const SUIT_PATHS = {
  S: 'M 0 -45 C -8 -25 -45 -10 -45 10 C -45 30 -25 38 -10 30 C -15 38 -22 42 -22 42 L 22 42 C 22 42 15 38 10 30 C 25 38 45 30 45 10 C 45 -10 8 -25 0 -45 Z',
  H: 'M 0 35 C -10 22 -25 5 -38 -8 C -50 -25 -38 -42 -22 -42 C -12 -42 -3 -32 0 -25 C 3 -32 12 -42 22 -42 C 38 -42 50 -25 38 -8 C 25 5 10 22 0 35 Z',
  D: 'M 0 -45 L 32 0 L 0 45 L -32 0 Z',
  C: 'M 0 -42 C 11.05 -42 20 -33.05 20 -22 C 20 -10.95 11.05 -2 0 -2 C -11.05 -2 -20 -10.95 -20 -22 C -20 -33.05 -11.05 -42 0 -42 Z M -26 -8 C -14.95 -8 -6 0.95 -6 12 C -6 23.05 -14.95 32 -26 32 C -37.05 32 -46 23.05 -46 12 C -46 0.95 -37.05 -8 -26 -8 Z M 26 -8 C 37.05 -8 46 0.95 46 12 C 46 23.05 37.05 32 26 32 C 14.95 32 6 23.05 6 12 C 6 0.95 14.95 -8 26 -8 Z M 0 -22 L -26 12 L 26 12 Z M -6 25 L 6 25 L 14 42 L -14 42 Z',
};

// Размеры элементов. Корнеры — ранг и масть визуально одинаковые (~30px высота).
// Центр — масть подогнана под размер буквы J/Q/K (cap-height ~77px при font 110pt).
const CORNER_RANK_FONT = 53;   // +25% от 42 → cap-height ≈ 37px
const CORNER_SUIT_SIZE = 38;   // +25% от 30 → height ≈ 38px (scale = 38/90)
const CENTER_SUIT_SIZE = 95;   // одна большая масть в центре для A и 2..10
const FACE_LETTER_FONT = 110;  // буква J/Q/K в центре

const FONT_FAMILY = "'Arial', 'Helvetica', sans-serif";

// Empirical letter baseline offset (Arial, через тестирование debug grid).
// Letter "2"/"K" с font-size N: alphabetic baseline на y, visible center на y - N*0.36.
// Хочу visible center на y_desired → y = y_desired + N*0.36.
const LETTER_BASELINE = 0.36;

function suitShape(suitKey, x, y, size, color, rotate = false) {
  // Path-suit нормирован на bbox ~100×90. Scale = size/90 примерно даёт высоту size.
  const scale = size / 90;
  const rot = rotate ? ` rotate(180)` : '';
  return `<g transform="translate(${x} ${y}) scale(${scale.toFixed(3)})${rot}"><path d="${SUIT_PATHS[suitKey]}" fill="${color}"/></g>`;
}

function letterEl(x, yDesired, text, fontSize, color, bold = false, rotate = false) {
  const yEff = yDesired + fontSize * LETTER_BASELINE;
  const transform = rotate ? `transform="rotate(180 ${x} ${yDesired})"` : '';
  const weight = bold ? ' font-weight="700"' : '';
  return `<text x="${x}" y="${yEff}" font-family="${FONT_FAMILY}" font-size="${fontSize}"${weight} fill="${color}" text-anchor="middle" ${transform}>${text}</text>`;
}

function cornerEl(x, yRankCenter, ySuitCenter, rank, suitKey, color, rotate = false) {
  const rankXform = rotate ? `transform="rotate(180 ${x} ${(yRankCenter + ySuitCenter) / 2})"` : '';
  const yRankEff = yRankCenter + CORNER_RANK_FONT * LETTER_BASELINE;
  const ySuitEffPos = rotate ? yRankCenter : ySuitCenter; // в rotated группе позиция rank/suit меняется визуально через rotate transform
  // Используем path-suit для угла (centered around (x, ySuitCenter))
  const groupY = (yRankCenter + ySuitCenter) / 2;
  return `
    <g transform="rotate(${rotate ? '180' : '0'} ${x} ${groupY})">
      <text x="${x}" y="${yRankEff}" font-family="${FONT_FAMILY}" font-size="${CORNER_RANK_FONT}" font-weight="700" fill="${color}" text-anchor="middle">${rank}</text>
      ${suitShape(suitKey, x, ySuitCenter, CORNER_SUIT_SIZE, color)}
    </g>
  `;
}

function buildCard(rank, suitKey) {
  const suit = SUITS[suitKey];
  const { color } = suit;

  // Углы: верхний-левый и нижний-правый (повёрнутый).
  // Корнер: ранг ближе к краю карты (y=36 в источнике), масть ниже к центру (y=82).
  // Для нижнего угла позиции в источнике меняются местами — после rotate(180) ранг
  // окажется у нижнего края карты, масть — выше к центру.
  const topCorner = cornerEl(26, 36, 82, rank, suitKey, color, false);
  const botCorner = cornerEl(W - 26, H - 82, H - 36, rank, suitKey, color, true);

  let centerContent = '';

  if (rank === 'J' || rank === 'Q' || rank === 'K') {
    // Только буква в центре, без дублирующей масти.
    centerContent = letterEl(W / 2, H / 2, rank, FACE_LETTER_FONT, color, true);
  } else {
    // A и 2..10 — одна большая масть в центре (ранг отличает только по углам).
    centerContent = suitShape(suitKey, W / 2, H / 2, CENTER_SUIT_SIZE, color);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="12" ry="12" fill="#ffffff" stroke="#cccccc" stroke-width="1.5"/>
  ${topCorner.trim()}
  ${botCorner.trim()}
  ${centerContent}
</svg>
`;
}

function buildBack() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <pattern id="diamonds" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
      <rect width="20" height="20" fill="#9d1d1d"/>
      <path d="M10,3 L17,10 L10,17 L3,10 Z" fill="none" stroke="#c0282d" stroke-width="1"/>
    </pattern>
  </defs>
  <rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="12" ry="12" fill="#9d1d1d" stroke="#1a1a1a" stroke-width="1.5"/>
  <rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="8" ry="8" fill="url(#diamonds)" stroke="#ffffff" stroke-width="2"/>
  <rect x="22" y="22" width="${W - 44}" height="${H - 44}" rx="4" ry="4" fill="none" stroke="#ffffff" stroke-width="1" stroke-opacity="0.6"/>
</svg>
`;
}

function main() {
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }

  let count = 0;
  for (const rank of RANKS) {
    for (const suit of Object.keys(SUITS)) {
      const filename = `${rank}${suit}.svg`;
      const svg = buildCard(rank, suit);
      writeFileSync(join(OUT_DIR, filename), svg, 'utf8');
      count++;
    }
  }

  writeFileSync(join(OUT_DIR, 'BACK.svg'), buildBack(), 'utf8');

  console.log(`OK: wrote ${count} cards + BACK.svg to ${OUT_DIR}`);
}

main();
