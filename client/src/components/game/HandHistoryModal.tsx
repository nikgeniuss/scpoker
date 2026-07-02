import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { API_URL } from '../../config/api';
import { useAuthStore } from '../../store/authStore';
import { Card } from './Card';
import type { CardData } from './Card';
import { formatChips } from '../../config/chipFormat';
import type { ChipDisplay } from '../../config/chipFormat';
import type { CardDeck } from '../../config/cardDeck';

// Запись истории раздачи (зеркало server/src/game/handHistory.ts; типы дублируются как и shared).
interface HistPlayer {
  id: string;
  username: string;
  displayName?: string;
  cards: CardData[];
  folded: boolean;
  revealed: boolean;
  net: number;
}
interface HistAction {
  phase: string;
  playerId: string;
  type: string;
  amount?: number;
}
interface HistRecord {
  id: string;
  t: number;
  roomName: string;
  smallBlind: number;
  bigBlind: number;
  board: CardData[];
  pot: number;
  winners: string[];
  winAmounts: Record<string, number>;
  handName?: string;
  players: HistPlayer[];
  actions: HistAction[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  myId: string | null; // игрок-фокус: его карты/net в списке (для админа — просматриваемый игрок)
  chipDisplay: ChipDisplay;
  cardDeck: CardDeck;
  cardBackStyle: string;
  fetchPath?: string; // путь API (по умолчанию свои руки; админ — '/admin/users/:id/hands')
  title?: string; // заголовок списка
  focusIsSelf?: boolean; // показывать «(вы)» у фокус-игрока (false для админ-просмотра)
}

// Карта рубашкой вниз (скрытые/сфолженные чужие карманные — §0.1 их не присылает).
const HiddenCard = () => (
  <div
    className="w-[26px] h-[36px] rounded-[3px] ring-1 ring-white/25"
    style={{
      backgroundImage:
        'repeating-linear-gradient(45deg, rgba(255,255,255,0.08) 0 2px, transparent 2px 4px), linear-gradient(135deg, #1e40af, #1e3a8a)',
    }}
  />
);

// История раздач игрока (ROADMAP §10.10): список последних раздач + детальный просмотр.
export const HandHistoryModal = ({
  open,
  onClose,
  myId,
  chipDisplay,
  cardDeck,
  cardBackStyle,
  fetchPath = '/hands',
  title,
  focusIsSelf = true,
}: Props) => {
  const { t, i18n } = useTranslation();
  const resolvedTitle = title ?? t('handHistoryModal.defaultTitle');
  const STREETS: { key: string; label: string; boardCount: number }[] = [
    { key: 'preflop', label: t('game.phasePreflop'), boardCount: 0 },
    { key: 'flop', label: t('game.phaseFlop'), boardCount: 3 },
    { key: 'turn', label: t('game.phaseTurn'), boardCount: 4 },
    { key: 'river', label: t('game.phaseRiver'), boardCount: 5 },
  ];
  const token = useAuthStore((s) => s.token);
  const [hands, setHands] = useState<HistRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [step, setStep] = useState(0); // текущий шаг replay (индекс в actions)

  // При открытии новой раздачи — replay с начала (префлоп).
  useEffect(() => {
    setStep(0);
  }, [selId]);

  useEffect(() => {
    if (!open) return;
    setSelId(null);
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(API_URL + fetchPath + '?limit=50', {
          headers: { Authorization: 'Bearer ' + token },
        });
        const data = await res.json();
        if (!cancelled) setHands(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setHands([]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, token, fetchPath]);

  if (!open) return null;

  const fmt = (n: number, bb: number) => formatChips(n, bb, chipDisplay);
  const time = (ts: number) => new Date(ts).toLocaleTimeString(i18n.language === 'en' ? 'en-US' : 'ru-RU', { hour: '2-digit', minute: '2-digit' });
  const sel = hands.find((h) => h.id === selId) ?? null;
  const nameOf = (id: string) => {
    const p = sel?.players.find((x) => x.id === id);
    return p ? p.displayName || p.username : id;
  };
  const actionLabel = (a: HistAction, bb: number): string => {
    switch (a.type) {
      case 'ante':
        return t('handHistoryModal.actionAnte') + ' ' + fmt(a.amount ?? 0, bb);
      case 'sb':
        return t('handHistoryModal.actionSb') + ' ' + fmt(a.amount ?? 0, bb);
      case 'bb':
        return t('handHistoryModal.actionBb') + ' ' + fmt(a.amount ?? 0, bb);
      case 'fold':
        return t('handHistoryModal.actionFold');
      case 'check':
        return t('handHistoryModal.actionCheck');
      case 'call':
        return t('handHistoryModal.actionCall') + ' ' + fmt(a.amount ?? 0, bb);
      case 'raise':
        return t('handHistoryModal.actionRaiseTo') + ' ' + fmt(a.amount ?? 0, bb);
      case 'all-in':
        return t('handHistoryModal.actionAllIn') + ' ' + fmt(a.amount ?? 0, bb);
      default:
        return a.type;
    }
  };

  const renderHole = (cards: CardData[], hidden: boolean) =>
    hidden || cards.length === 0 ? (
      <div className="flex gap-0.5">
        <HiddenCard />
        <HiddenCard />
      </div>
    ) : (
      <div className="flex gap-0.5">
        {cards.map((c, i) => (
          <Card key={i} card={c} faceStyle="classic" backStyle={cardBackStyle} deck={cardDeck} size="sm" />
        ))}
      </div>
    );

  return (
    <div data-noswipe className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[85dvh] flex flex-col bg-gray-900 rounded-2xl border border-white/10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Заголовок */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            {sel && (
              <button onClick={() => setSelId(null)} className="text-white/70 hover:text-white" aria-label={t('handHistoryModal.backToList')}>
                <ChevronLeft size={20} />
              </button>
            )}
            <span className="text-white font-bold">{sel ? t('handHistoryModal.detailsTitle') : resolvedTitle}</span>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white" aria-label={t('handHistoryModal.close')}>
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-400">{t('handHistoryModal.loading')}</div>
          ) : hands.length === 0 ? (
            <div className="p-8 text-center text-gray-400">{t('handHistoryModal.noHands')}</div>
          ) : sel ? (
            // === ДЕТАЛЬ ===
            <div className="p-4 space-y-4">
              <div className="text-center">
                <div className="text-white font-bold">{sel.roomName}</div>
                <div className="text-gray-400 text-xs">
                  {t('handHistoryModal.blindsLabel')} {sel.smallBlind / 100}/{sel.bigBlind / 100} · {time(sel.t)}
                  {sel.handName ? ' · ' + sel.handName : ''}
                </div>
              </div>
              {/* Борд */}
              <div className="flex justify-center gap-1">
                {sel.board.length > 0 ? (
                  sel.board.map((c, i) => (
                    <Card key={i} card={c} faceStyle="classic" backStyle={cardBackStyle} deck={cardDeck} size="sm" />
                  ))
                ) : (
                  <span className="text-gray-500 text-xs italic">{t('handHistoryModal.boardNotOpened')}</span>
                )}
              </div>
              <div className="text-center text-amber-300 text-sm font-bold">{t('common.potLabel')} {fmt(sel.pot, sel.bigBlind)}</div>
              {/* Игроки */}
              <div className="space-y-2">
                {sel.players.map((p) => {
                  const isWinner = sel.winners.includes(p.id);
                  const hideCards = p.id !== myId && !p.revealed;
                  return (
                    <div
                      key={p.id}
                      className={
                        'flex items-center gap-2 px-3 py-2 rounded-xl border ' +
                        (isWinner ? 'border-emerald-400/50 bg-emerald-500/10' : 'border-white/10 bg-white/5')
                      }
                    >
                      {renderHole(p.cards, hideCards)}
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-sm truncate">
                          {p.displayName || p.username}
                          {p.id === myId && focusIsSelf ? ' ' + t('handHistoryModal.youSuffix') : ''}
                          {p.folded ? <span className="text-gray-500 text-xs"> · {t('handHistoryModal.foldedSuffix')}</span> : ''}
                        </div>
                        {isWinner && (
                          <div className="text-emerald-400 text-xs font-bold">
                            {t('handHistoryModal.won')} +{fmt(sel.winAmounts[p.id] ?? 0, sel.bigBlind)}
                          </div>
                        )}
                      </div>
                      <div className={'text-sm font-bold tabular-nums ' + (p.net >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {p.net >= 0 ? '+' : ''}
                        {fmt(p.net, sel.bigBlind)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Ход раздачи — анимированный stepper (prev/next) с прокруткой стола. */}
              {sel.actions.length > 0 &&
                (() => {
                  const total = sel.actions.length;
                  const i = Math.min(step, total - 1);
                  const cur = sel.actions[i];
                  const st = STREETS.find((s) => s.key === cur.phase) ?? STREETS[0];
                  const revealed = sel.board.slice(0, st.boardCount);
                  return (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between">
                        <span className="text-white/80 text-sm font-bold">{t('handHistoryModal.handProgress')}</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setStep((v) => Math.max(0, v - 1))}
                            disabled={i === 0}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 text-white/80 disabled:opacity-30 hover:bg-white/20"
                            aria-label={t('handHistoryModal.back')}
                          >
                            <ChevronLeft size={16} />
                          </button>
                          <span className="text-white/60 text-xs tabular-nums w-12 text-center">
                            {i + 1} / {total}
                          </span>
                          <button
                            onClick={() => setStep((v) => Math.min(total - 1, v + 1))}
                            disabled={i === total - 1}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 text-white/80 disabled:opacity-30 hover:bg-white/20"
                            aria-label={t('handHistoryModal.forward')}
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>
                      {/* Стол: борд, открытый к текущему шагу (карты выезжают) */}
                      <div className="flex items-center justify-center gap-1 min-h-[44px] rounded-xl bg-black/30 border border-white/10 py-2">
                        <AnimatePresence mode="popLayout">
                          {revealed.length > 0 ? (
                            revealed.map((c, ci) => (
                              <motion.div
                                key={st.key + '-' + ci}
                                initial={{ scale: 0.6, opacity: 0, y: -6 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                transition={{ duration: 0.18 }}
                              >
                                <Card card={c} faceStyle="classic" backStyle={cardBackStyle} deck={cardDeck} size="sm" />
                              </motion.div>
                            ))
                          ) : (
                            <span className="text-gray-500 text-xs italic">{t('handHistoryModal.preflopLower')}</span>
                          )}
                        </AnimatePresence>
                      </div>
                      {/* Текущее действие */}
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                        <span className="text-poker-gold text-[10px] uppercase tracking-wider shrink-0">{st.label}</span>
                        <span className="text-sm text-gray-200 truncate">
                          <span className="text-white font-semibold">{nameOf(cur.playerId)}</span> — {actionLabel(cur, sel.bigBlind)}
                        </span>
                      </div>
                    </div>
                  );
                })()}
            </div>
          ) : (
            // === СПИСОК ===
            <div className="divide-y divide-white/5">
              {hands.map((h) => {
                const me = h.players.find((p) => p.id === myId);
                const myNet = me?.net ?? 0;
                return (
                  <button
                    key={h.id}
                    onClick={() => setSelId(h.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-left"
                  >
                    <span className="text-gray-400 text-xs w-10 shrink-0">{time(h.t)}</span>
                    {me ? renderHole(me.cards, false) : <span className="text-gray-600">—</span>}
                    <span className="flex-1 text-gray-400 text-xs truncate">
                      {h.smallBlind / 100}/{h.bigBlind / 100}
                    </span>
                    <span className={'text-sm font-bold tabular-nums ' + (myNet >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {myNet >= 0 ? '+' : ''}
                      {fmt(myNet, h.bigBlind)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
