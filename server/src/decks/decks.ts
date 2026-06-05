import { readdirSync, existsSync } from 'fs';
import { dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';
import { readJSON, writeJSON } from '../auth/storage.js';

// Папка images/ лежит в корне репо: server/src/decks → server/src → server → repo
const __dirname = dirname(fileURLToPath(import.meta.url));
export const IMAGES_DIR = join(__dirname, '../../../images');

import { type Suit, type Rank, SUITS, RANKS } from '../game/types.js';

// Ключ-идентификатор карты: '2H' (двойка червей), '10S' (десятка пик), 'AH' (туз червей)
export function rankSuitKey(rank: Rank, suit: Suit): string {
  return rank + suit[0].toUpperCase();
}

export const ALL_CARD_KEYS = RANKS.flatMap((r) => SUITS.map((s) => rankSuitKey(r, s)));

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
const DECKS_FILE = 'decks.json';

// Авто-парсер имён файлов. Поддерживает форматы:
//   2C, 10H, AS, JD          (стандарт)
//   2_c, 10-h, A.S, ten-s    (с разделителями)
//   ace_of_clubs, king-hearts, queenS  (длинные имена рангов/мастей)
// Возвращает null если не распознано.
export function parseCardFilename(filename: string): { rank: Rank; suit: Suit } | null {
  const base = filename.replace(/\.[^.]+$/, '').toLowerCase();
  // BACK*.png — это рубашки, лицо не определяем
  if (base.startsWith('back')) return null;
  // Чистим разделители — обрабатываем как «контекстную строку»
  const clean = base.replace(/[_\-\s.]/g, '');

  // Ищем ранг — длинные токены первыми (важно: '10', 'ten', 'king'... до короткого 't')
  const rankCandidates: Array<{ token: string; rank: Rank }> = [
    { token: '10', rank: '10' },
    { token: 'ten', rank: '10' },
    { token: 'jack', rank: 'J' },
    { token: 'queen', rank: 'Q' },
    { token: 'king', rank: 'K' },
    { token: 'ace', rank: 'A' },
    { token: 't', rank: '10' },
    { token: 'j', rank: 'J' },
    { token: 'q', rank: 'Q' },
    { token: 'k', rank: 'K' },
    { token: 'a', rank: 'A' },
    { token: '2', rank: '2' },
    { token: '3', rank: '3' },
    { token: '4', rank: '4' },
    { token: '5', rank: '5' },
    { token: '6', rank: '6' },
    { token: '7', rank: '7' },
    { token: '8', rank: '8' },
    { token: '9', rank: '9' },
  ];
  let foundRank: { rank: Rank; pos: number; len: number } | null = null;
  for (const c of rankCandidates) {
    const pos = clean.indexOf(c.token);
    if (pos === -1) continue;
    // Длинный токен побеждает короткий на том же месте; иначе берём первый по позиции
    if (!foundRank || c.token.length > foundRank.len) {
      foundRank = { rank: c.rank, pos, len: c.token.length };
    }
  }
  if (!foundRank) return null;

  // Масть — ищем вне диапазона ранга, чтобы не путать 'c' в 'clubs' с 'c' в 'club' и т.п.
  const suitCandidates: Array<{ token: string; suit: Suit }> = [
    { token: 'hearts', suit: 'hearts' },
    { token: 'diamonds', suit: 'diamonds' },
    { token: 'clubs', suit: 'clubs' },
    { token: 'spades', suit: 'spades' },
    { token: 'heart', suit: 'hearts' },
    { token: 'diamond', suit: 'diamonds' },
    { token: 'club', suit: 'clubs' },
    { token: 'spade', suit: 'spades' },
    { token: 'h', suit: 'hearts' },
    { token: 'd', suit: 'diamonds' },
    { token: 'c', suit: 'clubs' },
    { token: 's', suit: 'spades' },
  ];
  // Заменяем сам ранг в clean на маркер, чтобы коротыш-токен масти не совпал с буквой внутри ранга.
  const rankToken = clean.slice(foundRank.pos, foundRank.pos + foundRank.len);
  const withoutRank = clean.slice(0, foundRank.pos) + '#'.repeat(rankToken.length) + clean.slice(foundRank.pos + foundRank.len);

  let foundSuit: { suit: Suit; len: number } | null = null;
  for (const c of suitCandidates) {
    if (!withoutRank.includes(c.token)) continue;
    if (!foundSuit || c.token.length > foundSuit.len) {
      foundSuit = { suit: c.suit, len: c.token.length };
    }
  }
  if (!foundSuit) return null;

  return { rank: foundRank.rank, suit: foundSuit.suit };
}

export interface DeckFile {
  filename: string;
  url: string; // /decks/<deckId>/<filename>
}

export interface DeckInfo {
  id: string;
  label: string;
  files: DeckFile[];
  autoMap: Record<string, string>;       // карты, угаданные авто-парсером
  manualMap: Record<string, string>;     // override от админа (из decks.json)
  finalMap: Record<string, string>;      // итоговый mapping = autoMap, перекрытый manualMap
  unmappedFiles: string[];               // файлы, которые не распознаны или дубли
  missingCards: string[];                // ключи (типа '2H'), для которых нет файла
}

type AllManualMappings = Record<string, Record<string, string>>;

function readManualMappings(): AllManualMappings {
  try {
    return (readJSON(DECKS_FILE) as AllManualMappings) || {};
  } catch {
    return {};
  }
}

function saveManualMappings(map: AllManualMappings): void {
  writeJSON(DECKS_FILE, map);
}

// Сканирует images/ — каждая подпапка = колода. Возвращает все колоды с авто- и ручным mapping.
export function scanDecks(): DeckInfo[] {
  if (!existsSync(IMAGES_DIR)) return [];
  const allManual = readManualMappings();
  const subdirs = readdirSync(IMAGES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  return subdirs.map((dir) => {
    const dirPath = join(IMAGES_DIR, dir);
    const allFiles = readdirSync(dirPath, { withFileTypes: true })
      .filter((d) => d.isFile() && IMAGE_EXT.has(extname(d.name).toLowerCase()))
      .map((d) => d.name)
      .sort();

    const files: DeckFile[] = allFiles.map((f) => ({
      filename: f,
      url: `/decks/${dir}/${f}`,
    }));

    const autoMap: Record<string, string> = {};
    const unmappedFiles: string[] = [];

    for (const f of allFiles) {
      const parsed = parseCardFilename(f);
      if (!parsed) {
        unmappedFiles.push(f);
        continue;
      }
      const key = rankSuitKey(parsed.rank, parsed.suit);
      if (!autoMap[key]) {
        autoMap[key] = f;
      } else {
        // дубликат — оставляем первый в autoMap, второй в unmapped (админ разрулит вручную)
        unmappedFiles.push(f);
      }
    }

    // Ручной mapping — оставляем только записи с существующими файлами
    const rawManual = allManual[dir] || {};
    const manualMap: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawManual)) {
      if (typeof v === 'string' && allFiles.includes(v)) {
        manualMap[k] = v;
      }
    }

    // finalMap = autoMap, перекрытый manualMap. Пустые строки в manualMap = «сбросить авто»
    const finalMap: Record<string, string> = { ...autoMap };
    for (const [k, v] of Object.entries(manualMap)) {
      finalMap[k] = v;
    }

    const missingCards = ALL_CARD_KEYS.filter((k) => !finalMap[k]);

    return {
      id: dir,
      label: dir,
      files,
      autoMap,
      manualMap,
      finalMap,
      unmappedFiles,
      missingCards,
    };
  });
}

export interface UpdateMappingResult {
  success: boolean;
  error?: string;
}

// Обновляет ручной mapping одной колоды. manualMap — целиком, не диффом.
// Допустимы только ключи из ALL_CARD_KEYS и существующие имена файлов колоды.
export function updateManualMapping(deckId: string, manualMap: Record<string, string>): UpdateMappingResult {
  const dirPath = join(IMAGES_DIR, deckId);
  if (!existsSync(dirPath)) {
    return { success: false, error: 'Колода не найдена' };
  }
  if (typeof manualMap !== 'object' || manualMap === null || Array.isArray(manualMap)) {
    return { success: false, error: 'manualMap должен быть объектом' };
  }
  const filesInDeck = new Set(
    readdirSync(dirPath, { withFileTypes: true })
      .filter((d) => d.isFile() && IMAGE_EXT.has(extname(d.name).toLowerCase()))
      .map((d) => d.name),
  );
  const validKeys = new Set(ALL_CARD_KEYS);
  const cleaned: Record<string, string> = {};
  for (const [key, fname] of Object.entries(manualMap)) {
    if (!validKeys.has(key)) {
      return { success: false, error: `Неверный ключ карты: ${key}` };
    }
    if (typeof fname !== 'string') {
      return { success: false, error: `Имя файла должно быть строкой для ${key}` };
    }
    if (fname === '') continue; // пустая строка = сбросить override
    if (!filesInDeck.has(fname)) {
      return { success: false, error: `Файл не найден в колоде: ${fname}` };
    }
    cleaned[key] = fname;
  }
  const all = readManualMappings();
  all[deckId] = cleaned;
  saveManualMappings(all);
  return { success: true };
}
