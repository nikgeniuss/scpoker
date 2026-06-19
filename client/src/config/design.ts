export interface DesignConfig {
  cardBackStyle: string;
}

export const DEFAULT_DESIGN: DesignConfig = {
  cardBackStyle: 'classic-blue',
};

export interface DesignPreset {
  id: string;
  label: string;
  preview: string;
}

export const CARD_BACK_PRESETS: DesignPreset[] = [
  { id: 'classic-blue', label: 'Синий классика', preview: 'bg-gradient-to-br from-blue-700 to-blue-900' },
  { id: 'red-ornament', label: 'Красный орнамент', preview: 'bg-gradient-to-br from-red-700 to-red-900' },
  { id: 'gold', label: 'Золото', preview: 'bg-gradient-to-br from-yellow-500 to-yellow-700' },
];
