// Превью разбивки банка на фишки (зеркалит client/src/config/chipDenoms.ts) —
// фиксированная лестница 0.01..25000, любой банк собирается ТОЧНО.
// Запуск: node scripts/preview-chips-bets.mjs → открыть scripts/preview-chips-bets.html

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const LADDER = [
  { color: 'white', value: 1 }, { color: 'pink', value: 5 }, { color: 'cyan', value: 25 },
  { color: 'blue', value: 100 }, { color: 'red', value: 500 }, { color: 'green', value: 2500 },
  { color: 'black', value: 10000 }, { color: 'purple', value: 50000 }, { color: 'orange', value: 100000 },
  { color: 'gold', value: 500000 }, { color: 'brown', value: 2500000 },
];
const TEXT_DARK = new Set(['white', 'gold']);

function groups(amount) {
  const out = [];
  let rem = Math.floor(amount);
  for (let i = LADDER.length - 1; i >= 0; i--) {
    const d = LADDER[i];
    const c = Math.floor(rem / d.value);
    if (c > 0) { out.push({ ...d, count: c }); rem -= c * d.value; }
  }
  return out;
}
function denomLabel(cents) {
  const d = cents / 100;
  if (d >= 1000) { const k = d / 1000; return (Number.isInteger(k) ? String(k) : (+k.toFixed(1)).toString()) + 'K'; }
  if (Number.isInteger(d)) return String(d);
  return (+d.toFixed(2)).toString();
}
function fontScale(label) { return label.length >= 4 ? 0.24 : label.length === 3 ? 0.3 : label.length === 2 ? 0.36 : 0.42; }
function money(cents) { return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

const SIZE = 26, OFFSET = 5, CAP = 6;
function stackOf(amount) {
  const gs = groups(amount);
  const cols = gs.map((g) => {
    const n = Math.min(g.count, CAP);
    const h = SIZE + (n - 1) * OFFSET;
    const lbl = denomLabel(g.value);
    const chips = Array.from({ length: n }).map((_, i) =>
      `<div style="position:absolute;left:0;bottom:${i * OFFSET}px;z-index:${i};width:${SIZE}px;height:${SIZE}px">
         <img src="../client/public/chips/chip-${g.color}.svg" style="width:100%;height:100%;display:block"/>
         <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:900 ${Math.round(SIZE * fontScale(lbl))}px Arial;color:${TEXT_DARK.has(g.color) ? '#1a1a1a' : '#fff'};text-shadow:${TEXT_DARK.has(g.color) ? '0 1px 1px rgba(255,255,255,.4)' : '0 1px 2px rgba(0,0,0,.6)'}">${lbl}</span>
       </div>`).join('');
    return `<div style="position:relative;width:${SIZE}px;height:${h}px">${chips}</div>`;
  }).join('');
  return `<div class="cell"><div style="display:flex;align-items:flex-end;gap:3px">${cols}</div><div class="amt">${money(amount)}</div></div>`;
}

function row(title, amounts) {
  return `<h3>${title}</h3><div class="row">${amounts.map(stackOf).join('')}</div>`;
}

// Единая стопка: все фишки банка сложены в ОДНУ кучку (крупные снизу). Сдвиг подобран так,
// чтобы номинал КАЖДОЙ фишки был виден (подписанная стопка), а не только верхней.
const S2 = 42, OFF2 = 29, CAP2 = 16;
function singleChip(color, value, i) {
  const lbl = denomLabel(value);
  return `<div style="position:absolute;left:0;bottom:${i * OFF2}px;z-index:${i};width:${S2}px;height:${S2}px">
     <img src="../client/public/chips/chip-${color}.svg" style="width:100%;height:100%;display:block"/>
     <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:900 ${Math.round(S2 * fontScale(lbl))}px Arial;color:${TEXT_DARK.has(color) ? '#1a1a1a' : '#fff'};text-shadow:${TEXT_DARK.has(color) ? '0 1px 1px rgba(255,255,255,.4)' : '0 1px 2px rgba(0,0,0,.6)'}">${lbl}</span>
   </div>`;
}
function singleStack(chips, caption) {
  const n = Math.min(chips.length, CAP2);
  const shown = chips.slice(0, n); // крупные первыми → крупные снизу
  const h = S2 + (n - 1) * OFF2;
  const items = shown.map((c, i) => singleChip(c.color, c.value, i)).join('');
  return `<div class="cell"><div style="position:relative;width:${S2}px;height:${h}px">${items}</div><div class="amt">${caption}</div></div>`;
}
function stackOfAmount(amount) {
  const flat = [];
  for (const g of groups(amount)) for (let i = 0; i < g.count; i++) flat.push(g);
  return singleStack(flat, money(amount));
}
function rainbowStack() {
  const flat = [...LADDER].reverse(); // по одной каждого номинала, крупные снизу
  return singleStack(flat, 'по 1 каждого');
}

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
 body{margin:0;background:#137a3a;font-family:Arial,sans-serif;color:#fff;padding:24px}
 h2{margin:0 0 4px} h3{margin:18px 0 8px;font-size:14px}
 .row{display:flex;gap:26px;align-items:flex-end;flex-wrap:wrap;background:rgba(0,0,0,.12);padding:18px;border-radius:12px}
 .cell{display:flex;flex-direction:column;align-items:center;gap:5px}
 .amt{background:rgba(0,0,0,.75);color:#fcd34d;font-weight:700;font-size:11px;padding:1px 6px;border-radius:5px}
</style></head><body>
 <h2>Разбивка банка на фишки — фиксированная лестница, любой банк точно</h2>
 ${row('Центы / микро', [1, 5, 25, 37, 137, 237])}
 ${row('Мелкие банки', [100, 700, 1500, 9999])}
 ${row('Крупные / хай-стейкс', [100000, 1370000, 12345678])}
 <h3>Единая стопка (демонстрация — все фишки банка в одной кучке, крупные снизу)</h3>
 <div class="row" style="align-items:flex-end">
   ${rainbowStack()}
   ${stackOfAmount(13700)}
   ${stackOfAmount(98765)}
   ${stackOfAmount(250000)}
   ${stackOfAmount(1234567)}
 </div>
</body></html>`;

writeFileSync(join(__dirname, 'preview-chips-bets.html'), html, 'utf8');
console.log('Превью → ' + join(__dirname, 'preview-chips-bets.html'));
