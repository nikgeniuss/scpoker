// Настройки игры (тумблеры экрана «Настройки Игры») + авто-дополнение стека.
// Отдельно от chipDisplay/cardColors/betPresets — у тех свои модули и ключи.

export interface AutoTopUpSettings {
  enabled: boolean;
  // Докупать, когда стек опускается ниже порога (в больших блайндах)
  thresholdBB: number;
  // Докупать до этого уровня (в больших блайндах); сервер ограничит максимальным бай-ином стола
  targetBB: number;
}

export interface GameSettings {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  smartFocusEnabled: boolean;
  // Подсказка: моя текущая комбинация + шанс на выигрыш; у админа — итоговая своя комбинация
  // и текущая комбинация каждого игрока. Шанс считает сервер (против случайных рук, без утечки).
  handHintEnabled: boolean;
  autoTopUp: AutoTopUpSettings;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  soundEnabled: true,
  vibrationEnabled: true,
  smartFocusEnabled: true,
  handHintEnabled: true,
  autoTopUp: { enabled: false, thresholdBB: 50, targetBB: 100 },
};

const STORAGE_KEY = 'sk:gameSettings:v1';

// Слияние с дефолтами — устойчиво к старым/частичным записям после добавления полей.
export function loadGameSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_GAME_SETTINGS;
    const p = JSON.parse(raw) as Partial<GameSettings>;
    return {
      soundEnabled: typeof p.soundEnabled === 'boolean' ? p.soundEnabled : DEFAULT_GAME_SETTINGS.soundEnabled,
      vibrationEnabled:
        typeof p.vibrationEnabled === 'boolean' ? p.vibrationEnabled : DEFAULT_GAME_SETTINGS.vibrationEnabled,
      smartFocusEnabled:
        typeof p.smartFocusEnabled === 'boolean' ? p.smartFocusEnabled : DEFAULT_GAME_SETTINGS.smartFocusEnabled,
      handHintEnabled:
        typeof p.handHintEnabled === 'boolean' ? p.handHintEnabled : DEFAULT_GAME_SETTINGS.handHintEnabled,
      autoTopUp: {
        enabled:
          typeof p.autoTopUp?.enabled === 'boolean'
            ? p.autoTopUp.enabled
            : DEFAULT_GAME_SETTINGS.autoTopUp.enabled,
        thresholdBB:
          typeof p.autoTopUp?.thresholdBB === 'number'
            ? p.autoTopUp.thresholdBB
            : DEFAULT_GAME_SETTINGS.autoTopUp.thresholdBB,
        targetBB:
          typeof p.autoTopUp?.targetBB === 'number'
            ? p.autoTopUp.targetBB
            : DEFAULT_GAME_SETTINGS.autoTopUp.targetBB,
      },
    };
  } catch {
    return DEFAULT_GAME_SETTINGS;
  }
}

export function saveGameSettings(v: GameSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  } catch {
    // ignore
  }
}
