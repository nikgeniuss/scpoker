import { useMemo, useState } from 'react';
import { AVATAR_PRESETS } from '@poker-room/shared';
import { MobilePlayerSeat } from '../components/game/MobilePlayerSeat';
import { PlayerSeat } from '../components/game/PlayerSeat';
import type { PlayerView } from '../components/game/PlayerSeat';
import { ChipStack } from '../components/game/ChipStack';
import { buildSeatLayout } from '../utils/seatLayout';

// ВРЕМЕННАЯ страница для просмотра рассадки 2..12 игроков на разных разрешениях
// (по запросу пользователя, ROADMAP §10.1 — расширение макс. игроков 9→12).
// Маршрут /seating-preview. Без реального состояния игры — фейковые игроки.
// Можно удалить после визуальной проверки.

interface DevicePreset {
  label: string;
  width: number;
  height: number;
  mode: 'mobile' | 'desktop';
}

const DEVICES: DevicePreset[] = [
  { label: 'iPhone SE (375×667)', width: 375, height: 667, mode: 'mobile' },
  { label: 'iPhone 14 (390×844)', width: 390, height: 844, mode: 'mobile' },
  { label: 'Android узкий (360×740)', width: 360, height: 740, mode: 'mobile' },
  { label: 'Большой телефон (414×896)', width: 414, height: 896, mode: 'mobile' },
  { label: 'Планшет портрет (768×1024)', width: 768, height: 1024, mode: 'mobile' },
  { label: 'Desktop эллипс (1280×800)', width: 1280, height: 800, mode: 'desktop' },
];

function makeFakePlayers(n: number): PlayerView[] {
  const names = ['Я', 'Bogdan_88', 'Tania', 'Pavel_R', 'Алекс', 'Nikita_Pro', 'Olesya', 'MaksimChip', 'Vera99', 'DenisGo', 'Katrin', 'Sergey_W'];
  return Array.from({ length: n }, (_, i) => ({
    id: 'p' + i,
    username: names[i] || 'Игрок' + i,
    avatar: AVATAR_PRESETS[i % AVATAR_PRESETS.length],
    chips: 8000 + i * 731,
    cards: [],
    isFolded: false,
    currentBet: i === 2 ? 50 : i === 3 ? 100 : 0,
    position: i,
  }));
}

export function SeatingPreview() {
  const [count, setCount] = useState(9);
  const [deviceIdx, setDeviceIdx] = useState(0);
  const device = DEVICES[deviceIdx];
  const players = useMemo(() => makeFakePlayers(count), [count]);

  return (
    <div className="min-h-[100dvh] bg-[#0a0f0c] text-white p-4 space-y-4">
      <h1 className="text-xl font-bold">Рассадка игроков — превью (2..12)</h1>

      <div className="flex flex-wrap items-center gap-4 bg-gray-900 border border-white/10 rounded-xl p-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 mr-1">Игроков:</span>
          {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
            <button
              key={n}
              onClick={() => setCount(n)}
              className={
                'w-8 h-8 rounded-lg text-xs font-bold ' +
                (n === count ? 'bg-emerald-500 text-black' : 'bg-white/10 text-white/70 hover:bg-white/20')
              }
            >
              {n}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 mr-1">Разрешение:</span>
          <select
            className="bg-white/10 text-xs rounded-lg px-2 py-1.5 border border-white/10"
            value={deviceIdx}
            onChange={(e) => setDeviceIdx(Number(e.target.value))}
          >
            {DEVICES.map((d, i) => (
              <option key={d.label} value={i}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-center py-6 overflow-auto">
        <div
          className="relative bg-[#0a3d1d] border-4 border-black/60 rounded-[28px] overflow-hidden shrink-0"
          style={{ width: device.width, height: device.height }}
        >
          {device.mode === 'mobile' ? (
            <MobileFelt players={players} />
          ) : (
            <DesktopFelt players={players} />
          )}
        </div>
      </div>
    </div>
  );
}

// Мобильный овал — те же пропорции/классы, что в GameRoom.tsx (inset-x-4% top-6% bottom-2%).
function MobileFelt({ players }: { players: PlayerView[] }) {
  const layout = buildSeatLayout(players.length);
  const seats = players.map((player, k) => ({ player, ...layout[k] }));

  return (
    <div className="theme-clubgg mobile-table-felt absolute inset-x-[4%] top-[6%] bottom-[2%] pointer-events-none" style={{ perspective: '750px' }}>
      <div className="poker-oval-rail pointer-events-none" style={{ position: 'absolute', inset: 0, transform: 'translateY(-4%) rotateX(24deg) scaleY(1.15)' }}>
        <div className="poker-spotlight absolute inset-0 pointer-events-none rounded-[50%]" />
      </div>

      <div className="absolute inset-0 pointer-events-none">
        {seats.map(({ player, left, top, chipLeft, chipTop }) => (
          <div key={player.id}>
            {player.currentBet > 0 && (
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none"
                style={{ left: chipLeft + '%', top: chipTop + '%' }}
              >
                <ChipStack amount={player.currentBet} bigBlind={100} displayMode="chips" />
              </div>
            )}
            <div
              className="absolute z-20 pointer-events-auto"
              style={{ left: left + '%', top: top + '%', transform: 'translate(-50%, -50%)' }}
            >
              <MobilePlayerSeat
                player={player}
                isMe={false}
                isCurrent={false}
                isWinner={false}
                isDealer={player.id === 'p1'}
                isSmallBlind={player.id === 'p2'}
                isBigBlind={player.id === 'p3'}
                hasCardsInHand
                showHand={false}
                faceStyle="classic"
                backStyle="classic-blue"
                bigBlind={100}
                displayMode="chips"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Десктоп — формула-эллипс из useTableGeometry.ts (rx=40 ry=39).
function DesktopFelt({ players }: { players: PlayerView[] }) {
  const count = players.length;
  const seats = players.map((player, k) => {
    const angle = Math.PI / 2 + (k * 2 * Math.PI) / count;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      player,
      left: 50 + 40 * cos,
      top: 50 + 39 * sin,
      chipLeft: 50 + 22 * cos,
      chipTop: 50 + 23 * sin,
    };
  });

  return (
    <div className="absolute top-0 left-0 right-0 bottom-0">
      <div className="poker-spotlight absolute inset-0 pointer-events-none z-0" />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="poker-oval-rail w-[90%] max-w-4xl aspect-[200/115]" />
      </div>

      {seats.map(({ player, chipLeft, chipTop }) =>
        player.currentBet > 0 ? (
          <div
            key={'chip-' + player.id}
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
            style={{ left: chipLeft + '%', top: chipTop + '%' }}
          >
            <ChipStack amount={player.currentBet} bigBlind={100} displayMode="chips" />
          </div>
        ) : null,
      )}

      {seats.map(({ player, left, top }) => (
        <div
          key={player.id}
          className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
          style={{ left: left + '%', top: top + '%' }}
        >
          <PlayerSeat
            player={player}
            isSelf={player.id === 'p0'}
            isCurrent={false}
            isDealer={player.id === 'p1'}
            isSmallBlind={player.id === 'p2'}
            isBigBlind={player.id === 'p3'}
            hideRoleBadge={false}
            isWinner={false}
            showHand={false}
            faceStyle="classic"
            backStyle="classic-blue"
            bigBlind={100}
            displayMode="chips"
          />
        </div>
      ))}
    </div>
  );
}
