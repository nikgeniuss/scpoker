// Косметика инвентаря (ROADMAP §10.21.11-12) — стили рамки аватара и личной подсветки стола.
// Игрок хранит только КЛЮЧ стиля, клиент резолвит его в CSS здесь — единый источник правды для
// стола (PlayerSeat/MobilePlayerSeat/GameRoom) и магазина (LoyaltyShop). Списки зеркалят
// server/src/game/inventoryService.ts (FRAME_STYLES/TABLE_GLOW_STYLES).

export const FRAME_STYLES = ['bronze', 'silver', 'gold', 'emerald'] as const;
export type FrameStyle = (typeof FRAME_STYLES)[number];

// Кольцо вокруг круглого аватара (`ring-*` — тот же приём, что уже используют другие бейджи проекта).
export const FRAME_RING_CLASS: Record<FrameStyle, string> = {
  bronze: 'ring-2 ring-amber-700',
  silver: 'ring-2 ring-gray-300',
  gold: 'ring-2 ring-yellow-400',
  emerald: 'ring-2 ring-emerald-400',
};

export function frameRingClass(frame: string | undefined): string {
  return frame && (FRAME_STYLES as readonly string[]).includes(frame) ? FRAME_RING_CLASS[frame as FrameStyle] : '';
}

// Личная подсветка стола (видна ТОЛЬКО покупателю — не транспортируется через GameState,
// клиент резолвит её сам из /api/inventory/me). Аддитивный радиальный акцент поверх уже
// существующего фетра/AK-темы, не заменяет и не конфликтует с ними.
export const TABLE_GLOW_STYLES = ['emerald', 'sapphire', 'ruby', 'violet'] as const;
export type TableGlowStyle = (typeof TABLE_GLOW_STYLES)[number];

export const TABLE_GLOW_COLOR: Record<TableGlowStyle, string> = {
  emerald: 'rgba(16,185,129,0.35)',
  sapphire: 'rgba(56,189,248,0.35)',
  ruby: 'rgba(244,63,94,0.35)',
  violet: 'rgba(167,139,250,0.35)',
};

export function tableGlowColor(style: string | undefined): string | undefined {
  return style && (TABLE_GLOW_STYLES as readonly string[]).includes(style) ? TABLE_GLOW_COLOR[style as TableGlowStyle] : undefined;
}
