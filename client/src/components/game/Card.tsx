import { memo } from 'react';
import { motion } from 'framer-motion';
import { suitColorClass, DEFAULT_CARD_COLOR_SCHEME } from '../../config/cardColors';
import type { CardColorScheme } from '../../config/cardColors';
import { useDecksStore, cardKey } from '../../store/decksStore';
import { BASE_URL } from '../../config/api';
import type { Card as CardData, Suit, Rank } from '@poker-room/shared';

// Доменные типы карты — из общего контракта shared (CardData ≡ shared Card).
export type { CardData, Suit, Rank };

interface CardProps {
  card?: CardData;
  faceStyle: string;
  backStyle: string;
  colorScheme?: CardColorScheme; // Дефолт — стандарт (set1). Используется в text-fallback варианте.
  size?: 'sm' | 'md' | 'lg';
  delay?: number;
  highlight?: boolean; // Карта входит в выигрышную пятёрку — поднимается вверх + золотое свечение
  dim?: boolean; // Шоудаун: карта НЕ в выигрышной пятёрке — приглушаем opacity и насыщенность
}

const SUIT_SYMBOL: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

const SIZE_CLASS: Record<NonNullable<CardProps['size']>, string> = {
  sm: 'w-10 h-14 text-sm',
  md: 'w-14 h-20 text-lg',
  lg: 'w-20 h-28 text-2xl',
};

// CSS-fallback стили: используются, если faceStyle не указывает на существующую колоду
const FACE_BG: Record<string, string> = {
  classic: 'bg-gradient-to-br from-white to-gray-100 border border-gray-300',
  minimal: 'bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-400',
  'premium-gold': 'bg-gradient-to-br from-yellow-50 to-yellow-100 ring-2 ring-yellow-400',
};

const BACK_BG: Record<string, string> = {
  'classic-blue': 'bg-gradient-to-br from-blue-700 to-blue-900',
  'red-ornament': 'bg-gradient-to-br from-red-700 to-red-900',
  gold: 'bg-gradient-to-br from-yellow-500 to-yellow-700',
};

const BACK_PATTERN: Record<string, string> = {
  'classic-blue': '◆',
  'red-ornament': '✦',
  gold: '♔',
};

const CardImpl = ({ card, faceStyle, backStyle, colorScheme = DEFAULT_CARD_COLOR_SCHEME, size = 'md', delay = 0, highlight = false, dim = false }: CardProps) => {
  const sizeCls = SIZE_CLASS[size];
  // Шоудаун: highlight поднимает winning-карту вверх (без свечения/рамки — только лифт).
  // dim — отстраняет проигравшую/нерабочую карту (приглушение).
  const highlightCls = highlight ? ' relative z-20' : (dim ? ' relative' : '');
  // Лифт winning-карт вверх + слегка крупнее. Без glow/pulse.
  const motionTarget = {
    rotateY: 0,
    opacity: dim ? 0.45 : 1,
    y: highlight ? -18 : 0,
    scale: highlight ? 1.06 : 1,
  };

  // Если faceStyle совпадает с id одной из колод из images/ — рендерим картинку.
  // Иначе fallback на текстовый вид с CSS-градиентом.
  // O(1) selector — без линейного find() на каждый ререндер карты (на showdown это десятки lookup'ов).
  const matchedDeck = useDecksStore((s) => (card ? s.decksById.get(faceStyle) : undefined));
  const decksLoadedAt = useDecksStore((s) => s.loadedAt);

  if (!card) {
    const back = BACK_BG[backStyle] || BACK_BG['classic-blue'];
    const pattern = BACK_PATTERN[backStyle] || '◆';
    return (
      <motion.div
        initial={{ rotateY: 180, opacity: 0, y: -30 }}
        animate={motionTarget}
        transition={{ delay, duration: 0.35, ease: 'easeOut' }}
        className={
          sizeCls +
          ' rounded-lg ' +
          back +
          ' poker-card-shadow flex items-center justify-center text-white/30 select-none' +
          highlightCls
        }
      >
        <span className="text-2xl">{pattern}</span>
      </motion.div>
    );
  }

  if (matchedDeck) {
    const key = cardKey(card.rank, card.suit);
    const file = matchedDeck.finalMap[key];
    if (file) {
      return (
        <motion.div
          initial={{ rotateY: 180, opacity: 0, y: -30 }}
          animate={{ rotateY: 0, opacity: 1, y: 0 }}
          transition={{ delay, duration: 0.35, ease: 'easeOut' }}
          className={sizeCls + ' relative select-none' + highlightCls}
        >
          <img
            src={BASE_URL + '/decks/' + matchedDeck.id + '/' + encodeURIComponent(file) + '?v=' + decksLoadedAt}
            alt={key}
            className="w-full h-full object-contain drop-shadow-lg"
            draggable={false}
          />
        </motion.div>
      );
    }
    // карта не назначена в колоде — падаем в текстовый fallback (виден только админу для незакрытых слотов)
  }

  const face = FACE_BG[faceStyle] || FACE_BG['classic'];
  const color = suitColorClass(card.suit, colorScheme);

  return (
    <motion.div
      initial={{ rotateY: 180, opacity: 0, y: -30 }}
      animate={{ rotateY: 0, opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: 'easeOut' }}
      className={
        sizeCls +
        ' rounded-lg ' +
        face +
        ' poker-card-shadow flex flex-col justify-between p-1.5 relative select-none ' +
        color +
        highlightCls
      }
    >
      <div className="flex flex-col items-center leading-none">
        <span className="font-black">{card.rank}</span>
        <span>{SUIT_SYMBOL[card.suit]}</span>
      </div>
      <div className="absolute inset-0 flex items-center justify-center text-3xl opacity-80">
        {SUIT_SYMBOL[card.suit]}
      </div>
      <div className="flex flex-col items-center leading-none rotate-180">
        <span className="font-black">{card.rank}</span>
        <span>{SUIT_SYMBOL[card.suit]}</span>
      </div>
    </motion.div>
  );
};

// memo для пропуска ре-рендеров от родительского тикера (200ms): props стабильны между gameUpdate.
export const Card = memo(CardImpl);
