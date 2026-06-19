import { useEffect } from 'react';
import { Card } from '../components/game/Card';
import { useDecksStore } from '../store/decksStore';
import type { Rank, Suit } from '@poker-room/shared';

// ВРЕМЕННАЯ страница для просмотра всей колоды (по запросу пользователя).
// Маршрут /deck-preview. Можно удалить после просмотра.
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

export function DeckPreview() {
  const load = useDecksStore((s) => s.load);
  const loaded = useDecksStore((s) => s.loaded);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-[100dvh] bg-[#0a3d1d] text-white p-6 space-y-8">
      <h1 className="text-2xl font-bold">Колода — как выглядит в игре</h1>

      {!loaded && <div className="text-white/50">Загрузка колоды…</div>}

      {/* Классическая колода (faceStyle/deck как в GameRoom) */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-emerald-300">Классическая (deck='classic')</h2>
        <div className="space-y-2">
          {SUITS.map((suit) => (
            <div key={suit} className="flex flex-wrap gap-2 items-center">
              {RANKS.map((rank) => (
                <Card
                  key={rank + suit}
                  card={{ rank, suit }}
                  faceStyle="classic"
                  backStyle="classic-blue"
                  deck="classic"
                  size="lg"
                />
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* Цветная колода */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-emerald-300">Цветные (deck='colored')</h2>
        <div className="space-y-2">
          {SUITS.map((suit) => (
            <div key={suit} className="flex flex-wrap gap-2 items-center">
              {RANKS.map((rank) => (
                <Card
                  key={rank + suit}
                  card={{ rank, suit }}
                  faceStyle="classic"
                  backStyle="classic-blue"
                  deck="colored"
                  size="lg"
                />
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* Рубашки */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-emerald-300">Рубашки</h2>
        <div className="flex flex-wrap gap-4">
          {['classic-blue', 'red-ornament', 'gold'].map((back) => (
            <div key={back} className="flex flex-col items-center gap-1">
              <Card faceStyle="classic" backStyle={back} deck="classic" size="lg" />
              <span className="text-xs text-white/50">{back}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
