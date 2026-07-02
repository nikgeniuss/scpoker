import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import type { CardData } from './Card';
import { useTablesStore, MAX_TABLES } from '../../store/tablesStore';
import { formatMoney } from '../../config/chipFormat';

const SUIT_GLYPH: Record<string, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};
const isRed = (suit: string) => suit === 'hearts' || suit === 'diamonds';

// Мини-карта для пилюли (лёгкая, без полноценного Card — он от 'sm').
const MiniCard = ({ card }: { card: CardData }) => (
  <span
    className={
      'inline-flex items-center justify-center min-w-[15px] h-[20px] px-0.5 rounded-[3px] bg-white text-[11px] font-bold leading-none ' +
      (isRed(card.suit) ? 'text-red-600' : 'text-gray-900')
    }
  >
    {card.rank}
    {SUIT_GLYPH[card.suit] ?? ''}
  </span>
);

// Пилюли открытых столов (мультитейблинг) — top-left. Каждая показывает мои карты;
// активный стол выделен, стол с «моим ходом» — янтарная пульсация. «+» открывает лобби
// для нового стола (макс MAX_TABLES). Клик по пилюле — переключение активного стола.
export const TablePills = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { roomId: activeId } = useParams();
  const order = useTablesStore((s) => s.order);
  const tables = useTablesStore((s) => s.tables);

  return (
    <div className="flex items-center gap-1.5">
      {order.map((id) => {
        const tbl = tables[id];
        if (!tbl) return null;
        const active = id === activeId;
        return (
          <button
            key={id}
            onClick={() => navigate('/game/' + id)}
            title={tbl.roomName}
            className={
              'relative flex items-center gap-1 px-1.5 h-9 rounded-xl border backdrop-blur transition ' +
              (tbl.isMyTurn
                ? 'border-amber-400 ring-2 ring-amber-400/70 bg-amber-500/15 animate-pulse'
                : active
                  ? 'border-emerald-400/70 bg-emerald-500/15'
                  : 'border-white/15 bg-black/40 hover:bg-black/55')
            }
          >
            <span className="flex items-center gap-0.5">
              {tbl.myCards.length > 0 ? (
                tbl.myCards.map((c, i) => <MiniCard key={i} card={c} />)
              ) : (
                <span className="text-white/40 text-xs px-1">—</span>
              )}
            </span>
            {/* Бейдж выигрыша на showdown */}
            {tbl.wonAmount != null && tbl.wonAmount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 px-1 rounded-full bg-emerald-500 text-white text-[9px] font-black leading-tight shadow">
                +{formatMoney(tbl.wonAmount)}
              </span>
            )}
          </button>
        );
      })}
      {order.length < MAX_TABLES && (
        <button
          onClick={() => navigate('/lobby')}
          title={t('tablePills.openAnotherTable')}
          className="flex items-center justify-center w-9 h-9 rounded-xl bg-black/40 border border-white/15 text-white/70 hover:text-white hover:bg-black/55 transition"
        >
          <Plus size={18} />
        </button>
      )}
    </div>
  );
};
