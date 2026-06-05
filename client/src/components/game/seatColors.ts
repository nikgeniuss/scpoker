// Цвета аватара и фишек — вынесены из PlayerSeat.tsx, чтобы файл-компонент
// экспортировал только компонент (react-refresh) и эти константы переиспользовались
// без привязки к месту рендера (CLAUDE.md §0.11). Потребители: PlayerSeat, MobilePlayerSeat, ChipStack, Lobby.

// Стабильный цвет аватара из имени
export function avatarColor(username: string): string {
  const palette = [
    'from-pink-500 to-rose-600',
    'from-blue-500 to-indigo-600',
    'from-emerald-500 to-green-600',
    'from-purple-500 to-fuchsia-600',
    'from-amber-500 to-orange-600',
    'from-teal-500 to-cyan-600',
    'from-red-500 to-rose-700',
    'from-violet-500 to-purple-700',
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 31 + username.charCodeAt(i)) | 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

export const CHIP_COLOR: Record<string, string> = {
  classic: 'bg-gradient-to-br from-red-500 to-red-700 ring-2 ring-white/30',
  neon: 'bg-gradient-to-br from-cyan-400 to-purple-600 ring-2 ring-cyan-200/50',
  royale: 'bg-gradient-to-br from-yellow-400 to-yellow-700 ring-2 ring-yellow-200/50',
};
