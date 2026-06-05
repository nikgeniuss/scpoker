export interface DesignConfig {
  registrationStyle: string;
  cardFaceStyle: string;
  cardBackStyle: string;
  tableFelt: string;
  chipStyle: string;
  tableTheme: string; // 'classic' | 'luxe' | 'wood' — фирменный стиль стола
}

export const DEFAULT_DESIGN: DesignConfig = {
  registrationStyle: 'card-table',
  cardFaceStyle: 'classic',
  cardBackStyle: 'classic-blue',
  tableFelt: 'green',
  chipStyle: 'classic',
  tableTheme: 'classic',
};

export interface DesignPreset {
  id: string;
  label: string;
  preview: string;
}

export const REGISTRATION_PRESETS: DesignPreset[] = [
  { id: 'card-table', label: 'Карточный стол', preview: 'bg-gradient-to-br from-green-900 to-green-950' },
  { id: 'vip', label: 'VIP вход', preview: 'bg-gradient-to-br from-gray-900 to-black' },
  { id: 'neon', label: 'Неоновая карта', preview: 'bg-gradient-to-br from-purple-900 to-black' },
];

export const CARD_FACE_PRESETS: DesignPreset[] = [
  { id: 'classic', label: 'Классика', preview: 'bg-gradient-to-br from-white to-gray-100' },
  { id: 'minimal', label: 'Минимал', preview: 'bg-gradient-to-br from-gray-200 to-gray-300' },
  { id: 'premium-gold', label: 'Premium Gold', preview: 'bg-gradient-to-br from-yellow-50 to-yellow-100 ring-2 ring-yellow-400' },
];

export const CARD_BACK_PRESETS: DesignPreset[] = [
  { id: 'classic-blue', label: 'Синий классика', preview: 'bg-gradient-to-br from-blue-700 to-blue-900' },
  { id: 'red-ornament', label: 'Красный орнамент', preview: 'bg-gradient-to-br from-red-700 to-red-900' },
  { id: 'gold', label: 'Золото', preview: 'bg-gradient-to-br from-yellow-500 to-yellow-700' },
];

export const TABLE_FELT_PRESETS: DesignPreset[] = [
  { id: 'green', label: 'Зелёный классика', preview: 'bg-gradient-to-br from-green-700 to-green-900' },
  { id: 'burgundy', label: 'Бордовый', preview: 'bg-gradient-to-br from-red-900 to-red-950' },
  { id: 'blue', label: 'Синий', preview: 'bg-gradient-to-br from-blue-800 to-blue-950' },
  { id: 'black', label: 'Чёрный', preview: 'bg-gradient-to-br from-gray-800 to-black' },
];

export const CHIP_PRESETS: DesignPreset[] = [
  { id: 'classic', label: 'Классика', preview: 'bg-gradient-to-br from-red-500 to-red-700' },
  { id: 'neon', label: 'Неон', preview: 'bg-gradient-to-br from-cyan-400 to-purple-600' },
  { id: 'royale', label: 'Casino Royale', preview: 'bg-gradient-to-br from-yellow-400 to-yellow-700' },
];

// Тема стола — фирменный стиль (felt + rail + watermark + lighting) бандлом.
// Применяется как theme-{id} CSS-класс на корневом контейнере GameRoom.
// Само оформление каждой темы — в client/src/index.css.
export const TABLE_THEME_PRESETS: DesignPreset[] = [
  {
    id: 'clubgg',
    label: 'ClubGG (зелёный + чёрный rail)',
    preview: 'bg-[radial-gradient(ellipse_at_center,_#3a8a4e_0%,_#1f5a2c_70%)] ring-[3px] ring-black/80',
  },
  {
    id: 'classic',
    label: 'GGPoker Classic',
    preview: 'bg-[radial-gradient(ellipse_at_center,_#0e5e2e_0%,_#06281a_70%)] ring-2 ring-yellow-600/60',
  },
  {
    id: 'luxe',
    label: 'Luxe Casino',
    preview: 'bg-[radial-gradient(ellipse_at_center,_#243663_0%,_#05091c_70%)] ring-2 ring-slate-300/60',
  },
  {
    id: 'wood',
    label: 'Dark Wood',
    preview: 'bg-[radial-gradient(ellipse_at_center,_#5a1830_0%,_#1f0710_70%)] ring-2 ring-amber-700/60',
  },
];
